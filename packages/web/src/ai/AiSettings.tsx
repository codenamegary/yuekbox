import * as React from "react"
import {
  AiConfigPatch,
  AiConfig,
  EffortLevel,
  WriterScope,
  effortLevels,
  Setting,
} from "contracts/http/ai"
import { useQueryClient } from "@tanstack/react-query"
import { cn } from "@/lib/cn"
import { AiPresetIcon } from "./AiPresetIcon"
import { useAiConfigQuery, useAiModelsQuery, useAiPresetsQuery } from "./ai.queries"
import { useSaveAiConfigMutation } from "./ai.mutations"
import { queryKeys } from "@/queryKeys"

type AiSettingsProps = Readonly<{
  onClose: () => void
}>

type ScopeDraft = Readonly<{ baseUrl: string | null; apiKey: string | null }>

type ScopeDrafts = Readonly<Record<WriterScope, ScopeDraft>>

const untouched: ScopeDrafts = {
  style: { baseUrl: null, apiKey: null },
  lyrics: { baseUrl: null, apiKey: null },
  visuals: { baseUrl: null, apiKey: null },
}

const debounceMs = 600

const keyHintOf = (raw: string): string | null => {
  const trimmed = raw.trim()
  return trimmed === "" ? null : `···${trimmed.slice(-4)}`
}

type SettingPatchInput = Partial<Omit<Setting, "keyHint">> & { apiKey?: string }

type SettingEditorProps = Readonly<{
  scope: WriterScope
  title: string
  setting: Setting
  presets: readonly {
    id: string
    name: string
    icon: string
    baseUrl: string
    needsKey: boolean
    defaultModels: readonly string[]
  }[]
  models: readonly string[]
  modelsLive: boolean
  modelsDetail: string | null
  draft: ScopeDraft
  onBaseUrlChange: (scope: WriterScope, value: string) => void
  onApiKeyChange: (scope: WriterScope, value: string) => void
  onPatch: (scope: WriterScope, patch: SettingPatchInput) => void
  onRefreshModels: (scope: WriterScope) => void
  onFieldBlur: (scope: WriterScope) => void
}>

const SettingEditor: React.FC<SettingEditorProps> = ({
  scope,
  title,
  setting,
  presets,
  models,
  modelsLive,
  modelsDetail,
  draft,
  onBaseUrlChange,
  onApiKeyChange,
  onPatch,
  onRefreshModels,
  onFieldBlur,
}) => {
  const activePreset = presets.find((preset) => preset.id === setting.presetId)
  const fallbackModels = models.length > 0 ? models : (activePreset?.defaultModels ?? [])
  const options =
    setting.model !== "" && !fallbackModels.includes(setting.model)
      ? [setting.model, ...fallbackModels]
      : fallbackModels

  return (
    <div className="hairline-glass-box rounded-2xl p-4 space-y-3">
      <label
        htmlFor={`ai-${scope}-model`}
        className="block font-mono text-2xs tracking-[0.35em] uppercase text-cyan-300/80"
      >
        {title}
      </label>

      <div className="flex items-center gap-2 flex-wrap">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => {
              onPatch(
                scope,
                preset.baseUrl === ""
                  ? { presetId: preset.id, model: "" }
                  : { presetId: preset.id, baseUrl: preset.baseUrl, model: "" },
              )
              onBaseUrlChange(scope, preset.baseUrl)
            }}
            title={preset.baseUrl === "" ? `${preset.name} — bring your own URL` : preset.baseUrl}
            className={cn("ai-agent-chip", setting.presetId === preset.id && "active")}
          >
            <AiPresetIcon name={preset.icon} />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>

      <input
        type="text"
        value={draft.baseUrl ?? setting.baseUrl}
        onChange={(event) => onBaseUrlChange(scope, event.target.value)}
        onBlur={() => onFieldBlur(scope)}
        placeholder="https://api.example.com/v1"
        spellCheck={false}
        className="ai-input w-full"
        aria-label={`${scope} API base URL`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={draft.apiKey ?? ""}
          onChange={(event) => onApiKeyChange(scope, event.target.value)}
          onBlur={() => onFieldBlur(scope)}
          placeholder={
            setting.keyHint !== null
              ? `stored ${setting.keyHint}`
              : activePreset?.needsKey
                ? "API key"
                : "API key (optional)"
          }
          autoComplete="off"
          className="ai-input min-w-0 flex-1 basis-40"
          aria-label={`${scope} API key`}
        />

        <div className="flex items-center gap-1.5">
          {effortLevels.map((effort: EffortLevel) => (
            <button
              key={effort}
              type="button"
              onClick={() => onPatch(scope, { effort })}
              className={cn("ai-effort-chip", setting.effort === effort && "active")}
              title={effort === "off" ? "Send no reasoning effort" : `reasoning_effort: ${effort}`}
            >
              {effort}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <select
            id={`ai-${scope}-model`}
            value={setting.model}
            onChange={(event) => onPatch(scope, { model: event.target.value })}
            className="ai-select w-full"
            aria-label={`${scope} model`}
          >
            <option value="" className="bg-[#02050b] text-slate-100">
              pick a model…
            </option>
            {options.map((model) => (
              <option key={model} value={model} className="bg-[#02050b] text-slate-100">
                {model}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => onRefreshModels(scope)}
          className="ai-refresh"
          title="Fetch the model list from the endpoint"
        >
          ⟳
        </button>
      </div>

      <p className="font-mono text-3xs text-white/35 leading-relaxed">
        {modelsLive
          ? `live · ${models.length} model${models.length === 1 ? "" : "s"}`
          : (modelsDetail ?? "preset guesses — check the endpoint, then refresh")}
      </p>
    </div>
  )
}

type WriterPatch = Partial<Omit<Setting, "keyHint">> & { apiKey?: string }

const writerScopes: readonly WriterScope[] = ["style", "lyrics", "visuals"]

const writerTitles: Readonly<Record<WriterScope, string>> = {
  style: "style · writer",
  lyrics: "lyrics · writer",
  visuals: "visuals · writer",
}

export const AiSettings: React.FC<AiSettingsProps> = ({ onClose }) => {
  const presetsQuery = useAiPresetsQuery()
  const configQuery = useAiConfigQuery()
  const queryClient = useQueryClient()
  const saveConfig = useSaveAiConfigMutation()
  const [saveCount, setSaveCount] = React.useState(0)
  const [drafts, setDrafts] = React.useState<ScopeDrafts>(untouched)

  const modelQueries = {
    style: useAiModelsQuery("style", true, saveCount),
    lyrics: useAiModelsQuery("lyrics", true, saveCount),
    visuals: useAiModelsQuery("visuals", true, saveCount),
  }

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onClose])

  const config = configQuery.data
  const presets = presetsQuery.data?.presets ?? []

  const timers = React.useRef<Partial<Record<WriterScope, number>>>({})
  const pendingPatches = React.useRef<Partial<Record<WriterScope, WriterPatch>>>({})
  React.useEffect(
    () => () => {
      for (const timer of Object.values(timers.current)) {
        if (timer !== undefined) window.clearTimeout(timer)
      }
    },
    [],
  )

  const readConfig = () => queryClient.getQueryData<AiConfig>(queryKeys.aiConfig())

  const commitScope = (scope: WriterScope, patch: WriterPatch, base?: AiConfig) => {
    const current = base ?? readConfig()
    if (current === undefined) return
    const scopePatch: NonNullable<AiConfigPatch["style"]> = {
      presetId: patch.presetId ?? current[scope].presetId,
      baseUrl: patch.baseUrl ?? current[scope].baseUrl,
      model: patch.model ?? current[scope].model,
      effort: patch.effort ?? current[scope].effort,
      ...(patch.apiKey !== undefined
        ? { apiKey: patch.apiKey.trim() === "" ? "" : patch.apiKey.trim() }
        : {}),
    }
    saveConfig.mutate({ [scope]: scopePatch }, { onSuccess: () => setSaveCount((c) => c + 1) })
  }

  const patchScope = (scope: WriterScope, patch: WriterPatch) => {
    const current = readConfig()
    if (current === undefined) return
    const optimistic: AiConfig = {
      ...current,
      [scope]: {
        ...current[scope],
        presetId: patch.presetId ?? current[scope].presetId,
        baseUrl: patch.baseUrl ?? current[scope].baseUrl,
        model: patch.model !== undefined ? patch.model : current[scope].model,
        effort: patch.effort ?? current[scope].effort,
        keyHint: patch.apiKey === undefined ? current[scope].keyHint : keyHintOf(patch.apiKey),
      },
    }
    queryClient.setQueryData(queryKeys.aiConfig(), optimistic)
    commitScope(scope, patch, optimistic)
  }

  const patchScopeDebounced = (scope: WriterScope, patch: WriterPatch) => {
    pendingPatches.current[scope] = { ...pendingPatches.current[scope], ...patch }
    const pending = timers.current[scope]
    if (pending !== undefined) window.clearTimeout(pending)
    timers.current[scope] = window.setTimeout(() => flushScope(scope), debounceMs)
  }

  const flushScope = (scope: WriterScope) => {
    const pending = timers.current[scope]
    if (pending !== undefined) {
      window.clearTimeout(pending)
      timers.current[scope] = undefined
    }
    const merged = pendingPatches.current[scope]
    pendingPatches.current[scope] = undefined
    if (merged !== undefined) patchScope(scope, merged)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI settings"
      className="fixed inset-0 z-40 flex items-center justify-center p-6"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="ai-settings-panel hairline-glass-box relative w-full max-w-6xl rounded-2xl p-6 space-y-5 max-h-[86vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="text-xs font-mono font-bold tracking-widest text-slate-200 uppercase">
            machine spirits
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs font-mono"
          >
            ✕ Close
          </button>
        </div>

        {config === undefined ? (
          <p className="font-mono text-2xs text-slate-400 animate-pulse">waking the spirits…</p>
        ) : (
          <>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              onClick={() => {
                queryClient.setQueryData(queryKeys.aiConfig(), {
                  ...config,
                  enabled: !config.enabled,
                })
                saveConfig.mutate({ enabled: !config.enabled })
              }}
              className="ai-enable-toggle w-full"
            >
              <span className="font-mono text-2xs tracking-[0.35em] uppercase text-slate-300">
                ai enhancement
              </span>
              <span className={cn("ai-switch", config.enabled && "on")}>
                <span className="ai-switch-knob" />
              </span>
            </button>

            <div
              className={cn(
                "space-y-4 transition-opacity duration-500",
                config.enabled ? "opacity-100" : "opacity-40 pointer-events-none",
              )}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {writerScopes.map((scope) => (
                  <SettingEditor
                    key={scope}
                    scope={scope}
                    title={writerTitles[scope]}
                    setting={config[scope]}
                    presets={presets}
                    models={modelQueries[scope].data?.models ?? []}
                    modelsLive={modelQueries[scope].data?.live ?? false}
                    modelsDetail={modelQueries[scope].data?.detail ?? null}
                    draft={drafts[scope]}
                    onBaseUrlChange={(changedScope, value) => {
                      setDrafts((all) => ({
                        ...all,
                        [changedScope]: { ...all[changedScope], baseUrl: value },
                      }))
                      patchScopeDebounced(changedScope, { baseUrl: value })
                    }}
                    onApiKeyChange={(changedScope, value) => {
                      setDrafts((all) => ({
                        ...all,
                        [changedScope]: { ...all[changedScope], apiKey: value },
                      }))
                      patchScopeDebounced(changedScope, { apiKey: value })
                    }}
                    onPatch={patchScope}
                    onFieldBlur={flushScope}
                    onRefreshModels={(refreshScope) => {
                      void queryClient.refetchQueries({
                        queryKey: queryKeys.aiModels(refreshScope),
                      })
                    }}
                  />
                ))}
              </div>

              <p className="font-mono text-3xs text-white/30 leading-relaxed">
                any OpenAI-compatible endpoint works · keys stay on this machine
                {saveCount > 0 ? " · saved" : ""}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
