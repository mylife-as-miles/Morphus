/**
 * game-html.ts — Shared utilities for injecting the ElevenLabs bridge into
 * generated game HTML and creating blob URLs for it.
 */

import { loadCopilotSettings } from "./copilot/settings";

/** Inject a `window.elevenlabs` bridge into the game HTML.
 *  Uses the absolute editor origin so requests work from a blob: URL context. */
export function injectElevenLabsBridge(html: string): string {
  const origin = window.location.origin;
  const elevenLabsApiKey = loadCopilotSettings().elevenlabsApiKey;
  const bridge = `<script>
(function(){
  var B=${JSON.stringify(origin)};
  var K=${JSON.stringify(elevenLabsApiKey)};
  var ac=null;
  function headers(){
    var h={'Content-Type':'application/json'};
    if(K)h['x-elevenlabs-api-key']=K;
    return h;
  }
  function ctx(){
    if(!ac||ac.state==='closed')ac=new AudioContext();
    if(ac.state==='suspended')ac.resume();
    return ac;
  }
  function play(buf){
    return ctx().decodeAudioData(buf).then(function(a){
      return new Promise(function(res){
        var s=ctx().createBufferSource();s.buffer=a;s.connect(ctx().destination);s.onended=res;s.start();
      });
    });
  }
  window.elevenlabs={
    speak:function(text,opts){
      opts=opts||{};
      return fetch(B+'/api/elevenlabs/tts',{method:'POST',headers:headers(),body:JSON.stringify(Object.assign({text:text},opts))})
        .then(function(r){if(!r.ok)throw new Error('ElevenLabs TTS '+r.status);return r.arrayBuffer();}).then(play);
    },
    generateSfx:function(desc,dur){
      var b={description:desc};if(dur!=null)b.durationSeconds=dur;
      return fetch(B+'/api/elevenlabs/sfx',{method:'POST',headers:headers(),body:JSON.stringify(b)})
        .then(function(r){if(!r.ok)throw new Error('ElevenLabs SFX '+r.status);return r.arrayBuffer();}).then(play);
    }
  };
  console.log('[ElevenLabs Bridge] ready \u2192',B);
})();
<\/script>`;
  if (html.includes("</head>")) return html.replace("</head>", bridge + "\n</head>");
  if (html.includes("<head>")) return html.replace("<head>", "<head>\n" + bridge);
  return bridge + "\n" + html;
}

/** Build a blob URL for a game HTML string (with ElevenLabs bridge injected).
 *  Caller is responsible for calling URL.revokeObjectURL when done. */
export function buildGameBlobUrl(html: string): string {
  const blob = new Blob([injectElevenLabsBridge(html)], { type: "text/html" });
  return URL.createObjectURL(blob);
}
