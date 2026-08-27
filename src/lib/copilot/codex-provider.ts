import type {
  CopilotActivityItem,
  CopilotMessage,
  CopilotSession,
  CopilotToolCall,
  SessionBasedCopilotProvider
} from "./types";
import type { CodexWsServerMessage } from "./codex-ws-protocol";
import {
  createActivityItem,
  parseToolResult,
  summarizeToolArgs,
  summarizeToolResult,
  truncateText
} from "./activity";
import { worldbuildingStageForTool } from "./skill-service";

const TAG = "[AI-VIBE:CODEX]";

function uid(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createCodexProvider(): SessionBasedCopilotProvider {
  return {
    async runSession(config): Promise<CopilotSession> {
      const messages: CopilotMessage[] = [
        ...config.messages,
        { id: uid(), role: "user", content: config.userPrompt, timestamp: Date.now() }
      ];
      const activity: CopilotActivityItem[] = [...config.activity];

      const session: CopilotSession = {
        messages,
        activity,
        status: "thinking",
        iterationCount: 0,
        activeSkills: config.skillContext?.matchedSkills,
        activeSkillIds: config.skillContext?.activeSkillIds,
        availableSkillReferences: config.skillContext?.availableReferences,
        disabledSkillIds: config.disabledSkillIds,
        providerId: config.providerId,
        modelId: config.providerConfig.model,
        modeLabel: config.modeLabel,
        worldbuildingStage: config.skillContext?.activeSkillIds.includes("aaa-game-worldbuilding") ? "discovery" : undefined,
        worldbuildingQualityPreset: config.skillContext?.activeSkillIds.includes("aaa-game-worldbuilding") ? "none" : undefined
      };

      const emitUpdate = () =>
        config.onUpdate({
          ...session,
          messages: [...messages],
          activity: [...activity]
        });

      const pushActivity = (item: Omit<CopilotActivityItem, "id" | "timestamp">) => {
        activity.push(createActivityItem(item));
      };

      pushActivity({
        kind: "session",
        title: "Session started",
        detail: `${config.modeLabel} mode on ${config.providerId} (${config.providerConfig.model}) with ${config.tools.length} tools.`,
        tone: "info"
      });
      if (config.skillContext && config.skillContext.matchedSkills.length > 0) {
        pushActivity({
          kind: "session",
          title: "Skill context loaded",
          detail: config.skillContext.matchedSkills.map((skill) => skill.name).join(", "),
          tone: "info"
        });
      }
      emitUpdate();

      const wsTools = config.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters
      }));

      console.group(`${TAG} Session start`);
      console.log(`${TAG} Model:`, config.providerConfig.model);
      console.log(`${TAG} User prompt:`, config.userPrompt);
      console.log(`${TAG} Tools:`, wsTools.length);
      console.groupEnd();

      return new Promise<CopilotSession>((resolve) => {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const ws = new WebSocket(`${protocol}//${location.host}/ws/codex`);

        let agentText = "";
        let aborted = false;

        const finish = () => {
          config.signal?.removeEventListener("abort", handleAbort);
          ws.close();
          resolve(session);
        };

        const handleAbort = () => {
          aborted = true;
          ws.send(JSON.stringify({ type: "abort" }));
          ws.close();
          session.status = "aborted";
          pushActivity({
            kind: "status",
            title: "Run stopped",
            detail: "Stopped before the agent finished.",
            status: "aborted",
            tone: "warning"
          });
          emitUpdate();
          resolve(session);
        };

        config.signal?.addEventListener("abort", handleAbort, { once: true });

        ws.onopen = () => {
          console.log(`${TAG} WebSocket connected, sending start message`);
          ws.send(
            JSON.stringify({
              type: "start",
              model: config.providerConfig.model,
              systemPrompt: config.systemPrompt,
              threadId: config.threadId,
              tools: wsTools,
              userMessage: config.userPrompt
            })
          );
        };

        ws.onmessage = (event) => {
          if (aborted) {
            return;
          }

          const msg = JSON.parse(event.data) as CodexWsServerMessage;

          switch (msg.type) {
            case "thread": {
              config.onThreadId?.(msg.threadId);
              break;
            }

            case "status": {
              if (msg.status === "thinking") {
                session.status = "thinking";
              } else if (msg.status === "executing") {
                session.status = "executing";
              }
              emitUpdate();
              break;
            }

            case "delta": {
              agentText += msg.text;
              break;
            }

            case "tool_call": {
              session.status = "executing";
              session.iterationCount += 1;
              console.log(`  ${TAG} -> ${msg.name}`, JSON.stringify(msg.args, null, 2));

              const toolCall: CopilotToolCall = {
                id: msg.id,
                name: msg.name,
                args: msg.args
              };

              pushActivity({
                kind: "step",
                title: `Step ${session.iterationCount}`,
                detail: "Evaluating the next tool action.",
                iteration: session.iterationCount,
                tone: "info"
              });
              pushActivity({
                kind: "tool_call",
                title: `Calling ${msg.name}`,
                detail: summarizeToolArgs(msg.args),
                iteration: session.iterationCount,
                toolCall,
                tone: "info"
              });

              messages.push({
                id: uid(),
                role: "assistant",
                content: "",
                toolCalls: [toolCall],
                timestamp: Date.now()
              });
              emitUpdate();

              void (async () => {
                const startedAt = performance.now();
                const result = await config.executeTool(toolCall);
                const elapsed = Math.round(performance.now() - startedAt);
                const parsed = parseToolResult(result.result);

                if (parsed.success === false) {
                  console.warn(`  ${TAG} FAIL ${msg.name} (${elapsed}ms):`, parsed.error);
                } else {
                  console.log(`  ${TAG} OK ${msg.name} (${elapsed}ms):`, result.result);
                }

                messages.push({
                  id: uid(),
                  role: "tool",
                  content: "",
                  toolResults: [result],
                  timestamp: Date.now()
                });

                const stage = session.activeSkillIds?.includes("aaa-game-worldbuilding")
                  ? worldbuildingStageForTool(msg.name)
                  : undefined;
                if (stage) session.worldbuildingStage = stage;
                if (msg.name === "create_procedural_world" || msg.name === "set_procedural_world_preset") {
                  const preset = msg.args.preset;
                  if (preset === "low" || preset === "high" || preset === "ultra") session.worldbuildingQualityPreset = preset;
                }
                if (msg.name === "read_copilot_skill_reference") {
                  const referencePayload = parseToolResult(result.result).payload;
                  if (typeof referencePayload === "object" && referencePayload !== null && "reference" in referencePayload) {
                    const reference = (referencePayload as { reference?: { skillId?: unknown; referenceId?: unknown; title?: unknown } }).reference;
                    if (typeof reference?.skillId === "string" && typeof reference.referenceId === "string") {
                      const referenceKey = `${reference.skillId}:${reference.referenceId}`;
                      session.consultedSkillReferenceIds = Array.from(new Set([...(session.consultedSkillReferenceIds ?? []), referenceKey]));
                      pushActivity({
                        kind: "session",
                        title: `Consulted: ${typeof reference.title === "string" ? reference.title : reference.referenceId}`,
                        detail: "Read a focused skill reference range.",
                        iteration: session.iterationCount,
                        tone: "info"
                      });
                    }
                  }
                }

                pushActivity({
                  kind: "tool_result",
                  title: parsed.success ? `${msg.name} completed` : `${msg.name} failed`,
                  detail: summarizeToolResult(result.result),
                  iteration: session.iterationCount,
                  toolResult: result,
                  elapsedMs: elapsed,
                  tone: parsed.success ? "success" : "error"
                });

                ws.send(
                  JSON.stringify({
                    type: "tool_result",
                    id: msg.id,
                    result: result.result,
                    success: parsed.success
                  })
                );

                session.status = "thinking";
                emitUpdate();
              })();
              break;
            }

            case "tool_status": {
              break;
            }

            case "turn_complete": {
              const finalText = msg.text || agentText;
              console.log(`${TAG} Turn complete. Agent text:`, finalText);

              if (finalText) {
                messages.push({
                  id: uid(),
                  role: "assistant",
                  content: finalText,
                  timestamp: Date.now()
                });
                pushActivity({
                  kind: "assistant",
                  title: "Final response ready",
                  detail: truncateText(finalText),
                  iteration: session.iterationCount || undefined,
                  tone: "success"
                });
              }

              session.status = "idle";
              session.messages = messages;
              emitUpdate();
              finish();
              break;
            }

            case "auth_required": {
              session.status = "error";
              session.error =
                msg.message || 'Not authenticated. Run "codex login" in your terminal.';
              pushActivity({
                kind: "error",
                title: "Codex authentication required",
                detail: session.error,
                status: "error",
                tone: "error"
              });
              emitUpdate();
              finish();
              break;
            }

            case "error": {
              console.error(`${TAG} Error:`, msg.message);
              session.status = "error";
              session.error = msg.message;
              pushActivity({
                kind: "error",
                title: "Codex session error",
                detail: msg.message,
                status: "error",
                tone: "error"
              });
              emitUpdate();
              if (msg.fatal) {
                finish();
              }
              break;
            }
          }
        };

        ws.onerror = () => {
          if (aborted) {
            return;
          }

          session.status = "error";
          session.error = "WebSocket connection failed. Is the editor server running?";
          pushActivity({
            kind: "error",
            title: "Connection failed",
            detail: session.error,
            status: "error",
            tone: "error"
          });
          emitUpdate();
          finish();
        };

        ws.onclose = () => {
          if (aborted || session.status === "idle" || session.status === "error") {
            return;
          }

          session.status = "error";
          session.error = "Connection closed unexpectedly";
          pushActivity({
            kind: "error",
            title: "Connection closed",
            detail: session.error,
            status: "error",
            tone: "error"
          });
          emitUpdate();
          finish();
        };
      });
    }
  };
}
