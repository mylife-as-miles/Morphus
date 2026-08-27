import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditorCore } from "@blud/editor-core";
import type { CopilotImageAttachment, CopilotSession } from "@/lib/copilot/types";
import { bundledCopilotSkills } from "@/generated/copilot-skills-manifest";
import { isCopilotConfigured, loadCopilotSettings } from "@/lib/copilot/settings";
import type { CopilotToolExecutionContext } from "@/lib/copilot/tool-executor";
import { appendSkillContextToPrompt, discoverCopilotSkills } from "@/lib/copilot/skills";
import {
  listCopilotSkillReferences,
  matchCopilotSkills,
  readCopilotSkillReference,
  searchCopilotSkillReferences
} from "@/lib/copilot/skill-service";
import { loadCopilotMemory, saveCopilotMemory } from "@/lib/copilot/copilot-memory";

export type GeneratedGame = { title: string; html: string };

const EMPTY_SESSION: CopilotSession = {
  messages: [],
  activity: [],
  status: "idle",
  iterationCount: 0
};

const COPILOT_SKILL_REFERENCE_DEFAULT_READ_CHARS = 24000;
const COPILOT_SKILL_REFERENCE_RUN_CHAR_BUDGET = 80000;
const COPILOT_SKILL_REFERENCE_RUN_UNIQUE_DOCUMENT_BUDGET = 6;

const MEMORY_KEY = "copilot";

type CopilotRuntime = {
  runAgenticLoop: typeof import("@/lib/copilot/agentic-loop").runAgenticLoop;
  createCopilotProvider: typeof import("@/lib/copilot/provider").createCopilotProvider;
  buildEditorSystemPrompt: typeof import("@/lib/copilot/system-prompt").buildEditorSystemPrompt;
  EDITOR_COPILOT_TOOL_DECLARATIONS: typeof import("@/lib/copilot/tool-declarations").EDITOR_COPILOT_TOOL_DECLARATIONS;
  executeTool: typeof import("@/lib/copilot/tool-executor").executeTool;
};

let copilotRuntimePromise: Promise<CopilotRuntime> | null = null;

function loadCopilotRuntime(): Promise<CopilotRuntime> {
  if (!copilotRuntimePromise) {
    copilotRuntimePromise = Promise.all([
      import("@/lib/copilot/agentic-loop"),
      import("@/lib/copilot/provider"),
      import("@/lib/copilot/system-prompt"),
      import("@/lib/copilot/tool-declarations"),
      import("@/lib/copilot/tool-executor")
    ]).then(([agenticLoop, provider, systemPrompt, toolDeclarations, toolExecutor]) => ({
      runAgenticLoop: agenticLoop.runAgenticLoop,
      createCopilotProvider: provider.createCopilotProvider,
      buildEditorSystemPrompt: systemPrompt.buildEditorSystemPrompt,
      EDITOR_COPILOT_TOOL_DECLARATIONS: toolDeclarations.EDITOR_COPILOT_TOOL_DECLARATIONS,
      executeTool: toolExecutor.executeTool
    }));
  }

  return copilotRuntimePromise;
}

function extractHtmlFromMessages(messages: CopilotSession["messages"]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "assistant" || !message.content) {
      continue;
    }

    const match = /```html\s*([\s\S]+?)```/i.exec(message.content);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

function cloneSession(updated: CopilotSession): CopilotSession {
  return {
    ...updated,
    messages: [...updated.messages],
    activity: [...updated.activity]
  };
}

export function createBudgetedCopilotSkillToolContext(
  baseContext: CopilotToolExecutionContext,
  activeSkillIds: string[]
): CopilotToolExecutionContext {
  let readCharsUsed = 0;
  const readCache = new Map<string, Record<string, unknown>>();
  const uniqueDocuments = new Set<string>();
  const catalog = { skills: bundledCopilotSkills.filter((skill) => activeSkillIds.includes(skill.id)) };
  const inactiveSkillResult = (skillId: string) => ({
    error: {
      code: "inactive_skill",
      message: `Skill ${skillId} is not active for this run. Use an active skill or start a new matching request.`
    },
    success: false
  });

  return {
    ...baseContext,
    copilotListSkillReferences: (skillId) => {
      if (skillId && !activeSkillIds.includes(skillId)) return inactiveSkillResult(skillId);
      return listCopilotSkillReferences(catalog, skillId);
    },
    copilotReadSkillReference: (skillId, referenceId, options) => {
      if (!activeSkillIds.includes(skillId)) return inactiveSkillResult(skillId);
      const maxChars = Math.max(1000, Math.min(Math.floor(options?.maxChars ?? COPILOT_SKILL_REFERENCE_DEFAULT_READ_CHARS), COPILOT_SKILL_REFERENCE_DEFAULT_READ_CHARS));
      const cacheKey = JSON.stringify({ endLine: options?.endLine, maxChars, referenceId, skillId, startLine: options?.startLine });
      if (readCache.has(cacheKey)) {
        return {
          cached: true,
          message: "This skill reference range was already read during this run. Use the previous content instead of reading it again.",
          readBudget: {
            charsUsed: readCharsUsed,
            maxChars: COPILOT_SKILL_REFERENCE_RUN_CHAR_BUDGET,
            maxUniqueDocuments: COPILOT_SKILL_REFERENCE_RUN_UNIQUE_DOCUMENT_BUDGET,
            uniqueDocumentsRead: uniqueDocuments.size
          },
          reference: readCache.get(cacheKey)?.reference
        };
      }

      const documentKey = `${skillId}:${referenceId}`;
      if (!uniqueDocuments.has(documentKey) && uniqueDocuments.size >= COPILOT_SKILL_REFERENCE_RUN_UNIQUE_DOCUMENT_BUDGET) {
        return {
          budgetExceeded: true,
          message: "Copilot skill reference document budget reached for this run. Use the references already consulted to continue the task.",
          readBudget: {
            charsUsed: readCharsUsed,
            maxChars: COPILOT_SKILL_REFERENCE_RUN_CHAR_BUDGET,
            maxUniqueDocuments: COPILOT_SKILL_REFERENCE_RUN_UNIQUE_DOCUMENT_BUDGET,
            uniqueDocumentsRead: uniqueDocuments.size
          },
          success: false
        };
      }
      if (readCharsUsed + maxChars > COPILOT_SKILL_REFERENCE_RUN_CHAR_BUDGET) {
        return {
          budgetExceeded: true,
          message: "Copilot skill reference character budget reached for this run. Use the references already consulted to continue the task.",
          readBudget: {
            charsUsed: readCharsUsed,
            maxChars: COPILOT_SKILL_REFERENCE_RUN_CHAR_BUDGET,
            maxUniqueDocuments: COPILOT_SKILL_REFERENCE_RUN_UNIQUE_DOCUMENT_BUDGET,
            uniqueDocumentsRead: uniqueDocuments.size
          },
          success: false
        };
      }

      const result = readCopilotSkillReference(catalog, skillId, referenceId, { ...options, maxChars });
      if (result.success === false || typeof result.content !== "string") return result;
      readCharsUsed += result.content.length;
      uniqueDocuments.add(documentKey);
      const budgetedResult = {
        ...result,
        readBudget: {
          charsUsed: readCharsUsed,
          maxChars: COPILOT_SKILL_REFERENCE_RUN_CHAR_BUDGET,
          maxUniqueDocuments: COPILOT_SKILL_REFERENCE_RUN_UNIQUE_DOCUMENT_BUDGET,
          uniqueDocumentsRead: uniqueDocuments.size
        }
      };
      readCache.set(cacheKey, budgetedResult);
      return budgetedResult;
    },
    copilotSearchSkillReferences: (query, options) => {
      if (options?.skillId && !activeSkillIds.includes(options.skillId)) return inactiveSkillResult(options.skillId);
      return searchCopilotSkillReferences(catalog, query, options);
    }
  };
}

export function useCopilot(
  editor: EditorCore,
  toolContext: CopilotToolExecutionContext = {}
) {
  const [session, setSession] = useState<CopilotSession>(EMPTY_SESSION);
  const [configured, setConfigured] = useState(() => isCopilotConfigured());
  const [latestGame, setLatestGame] = useState<GeneratedGame | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const codexThreadIdRef = useRef<string | undefined>(undefined);
  const pendingGameTitleRef = useRef<string | null>(null);
  const memoryLoadedRef = useRef(false);

  const publishSession = useCallback((updated: CopilotSession) => {
    const nextSession = cloneSession(updated);

    startTransition(() => {
      setSession(nextSession);
    });
  }, []);

  const mergedToolContext = useMemo<CopilotToolExecutionContext>(
    () => ({ ...toolContext }),
    [toolContext]
  );

  useEffect(() => {
    const check = () => setConfigured(isCopilotConfigured());

    window.addEventListener("focus", check);
    window.addEventListener("storage", check);

    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", check);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCopilotMemory(MEMORY_KEY).then((memory) => {
      if (cancelled) {
        return;
      }

      if (memory.session) {
        setSession(memory.session);
      }
      memoryLoadedRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!memoryLoadedRef.current) {
      return;
    }

    void saveCopilotMemory({
      session,
      updatedAt: Date.now()
    }, MEMORY_KEY);
  }, [session]);

  useEffect(() => {
    if (session.status !== "idle" || !pendingGameTitleRef.current) {
      return;
    }

    const title = pendingGameTitleRef.current;
    pendingGameTitleRef.current = null;

    const html = extractHtmlFromMessages(session.messages);

    if (html) {
      setLatestGame({ title, html });
    }
  }, [session.status, session.messages]);

  const sendMessage = useCallback(
    async (prompt: string, images?: CopilotImageAttachment[]) => {
      if (abortRef.current || session.status === "thinking" || session.status === "executing") {
        return;
      }

      const settings = loadCopilotSettings();

      if (!isCopilotConfigured(settings)) {
        setSession((previous) => ({
          ...previous,
          status: "error",
          error:
            settings.provider === "codex"
              ? 'Codex not configured. Run "codex login" in your terminal.'
              : "No API key configured. Open Copilot settings to add one."
        }));
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      const [
        {
          runAgenticLoop,
          createCopilotProvider,
          buildEditorSystemPrompt,
          EDITOR_COPILOT_TOOL_DECLARATIONS,
          executeTool
        },
        discoveredSkillContext
      ] = await Promise.all([
        loadCopilotRuntime(),
        discoverCopilotSkills(prompt, {
          activeSkillIds: session.activeSkillIds,
          disabledSkillIds: session.disabledSkillIds
        })
      ]);

      const skillContext =
        discoveredSkillContext ?? matchCopilotSkills(prompt, { skills: bundledCopilotSkills }, {
          activeSkillIds: session.activeSkillIds,
          disabledSkillIds: session.disabledSkillIds
        });

      const copilotProvider = createCopilotProvider(settings.provider);
      const baseSystemPrompt = buildEditorSystemPrompt(editor, {
        activeSkillId: skillContext?.activeSkillIds.includes("aaa-game-worldbuilding")
          ? "aaa-game-worldbuilding"
          : undefined
      });
      const systemPrompt = appendSkillContextToPrompt(baseSystemPrompt, skillContext);
      const modeLabel = "editor";
      const tools = EDITOR_COPILOT_TOOL_DECLARATIONS;
      const runToolContext = createBudgetedCopilotSkillToolContext(mergedToolContext, skillContext?.activeSkillIds ?? []);

      console.log(`[COPILOT] Mode: editor (${tools.length} tools)`);

      const providerConfig = {
        apiKey: "",
        model: settings.provider === "gemini" ? settings.gemini.model : settings.codex.model,
        temperature: settings.temperature
      };

      if (copilotProvider.kind === "session-based") {
        await copilotProvider.provider.runSession({
          messages: session.messages,
          activity: session.activity,
          userPrompt: prompt,
          tools,
          systemPrompt,
          providerConfig,
          providerId: settings.provider,
          modeLabel,
          skillContext,
          disabledSkillIds: session.disabledSkillIds,
          threadId: codexThreadIdRef.current,
          onThreadId: (threadId) => {
            codexThreadIdRef.current = threadId;
          },
          executeTool: (toolCall) => executeTool(editor, toolCall, runToolContext),
          onUpdate: publishSession,
          signal: controller.signal
        });
      } else {
        await runAgenticLoop(
          prompt,
          session.messages,
          {
            provider: copilotProvider.provider,
            providerConfig,
            providerId: settings.provider,
            modeLabel,
            skillContext,
            disabledSkillIds: session.disabledSkillIds,
            existingActivity: session.activity,
            systemPrompt,
            tools,
            executeTool: (toolCall) => executeTool(editor, toolCall, runToolContext),
            onUpdate: publishSession
          },
          controller.signal,
          images
        );
      }

      abortRef.current = null;
    },
    [editor, mergedToolContext, publishSession, session.activeSkillIds, session.activity, session.disabledSkillIds, session.messages]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const clearHistory = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    codexThreadIdRef.current = undefined;
    pendingGameTitleRef.current = null;
    setSession(EMPTY_SESSION);
    void saveCopilotMemory({
      session: EMPTY_SESSION,
      updatedAt: Date.now()
    }, MEMORY_KEY);
  }, []);

  const clearLatestGame = useCallback(() => setLatestGame(null), []);

  const disableSkill = useCallback((skillId: string) => {
    setSession((previous) => {
      const disabledSkillIds = Array.from(new Set([...(previous.disabledSkillIds ?? []), skillId]));
      return {
        ...previous,
        activeSkillIds: (previous.activeSkillIds ?? []).filter((id) => id !== skillId),
        activeSkills: (previous.activeSkills ?? []).filter((skill) => skill.id !== skillId),
        availableSkillReferences: (previous.availableSkillReferences ?? []).filter((reference) => reference.skillId !== skillId),
        consultedSkillReferenceIds: (previous.consultedSkillReferenceIds ?? []).filter((id) => !id.startsWith(`${skillId}:`)),
        disabledSkillIds
      };
    });
  }, []);

  return {
    session,
    sendMessage,
    abort,
    clearHistory,
    disableSkill,
    isConfigured: configured,
    refreshConfigured: () => setConfigured(isCopilotConfigured()),
    latestGame,
    clearLatestGame
  };
}
