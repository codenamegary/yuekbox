import * as React from "react"
import { useEscapeKey } from "@/lib/use-escape-key"
import {
  AiConfigPatch,
  AiConfig,
  EffortLevel,
  WriterScope,
  effortLevels,
  Setting,
} from "contracts/http/ai"
import { useQueryClient } from "@tanstack/react-query"
import { RefreshCw, X } from "lucide-react"
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
    <section className="cabinet-raised space-y-4 rounded-2xl p-5" aria-label={title}>
      <div>
        <h3 className="text-lg font-semibold text-ivory">{title}</h3>
        <p className="text-base text-dim">{writerBlurbs[scope]}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
            aria-pressed={setting.presetId === preset.id}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
              setting.presetId === preset.id
                ? "border-amber-soft bg-amber text-strip-ink"
                : "border-cabinet-edge bg-cabinet text-dim hover:border-amber/60 hover:text-ivory",
            )}
          >
            <AiPresetIcon name={preset.icon} />
            <span>{preset.name}</span>
          </button>
        ))}
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-dim">Endpoint</span>
        <input
          type="text"
          value={draft.baseUrl ?? setting.baseUrl}
          onChange={(event) => onBaseUrlChange(scope, event.target.value)}
          onBlur={() => onFieldBlur(scope)}
          placeholder="https://api.example.com/v1"
          spellCheck={false}
          className="field w-full px-3 py-2 font-mono text-base"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-dim">API key</span>
        <input
          type="password"
          value={draft.apiKey ?? ""}
          onChange={(event) => onApiKeyChange(scope, event.target.value)}
          onBlur={() => onFieldBlur(scope)}
          placeholder={
            setting.keyHint !== null
              ? `Stored ${setting.keyHint}`
              : activePreset?.needsKey
                ? "Required"
                : "Optional"
          }
          autoComplete="off"
          className="field w-full px-3 py-2 font-mono text-base"
        />
      </label>

      <div className="space-y-1.5">
        <label htmlFor={`ai-${scope}-model`} className="block text-sm font-medium text-dim">
          Model
        </label>
        <div className="flex items-center gap-2">
          <select
            id={`ai-${scope}-model`}
            value={setting.model}
            onChange={(event) => onPatch(scope, { model: event.target.value })}
            className="field min-w-0 flex-1 px-3 py-2 font-mono text-base"
          >
            <option value="">Pick a model…</option>
            {options.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onRefreshModels(scope)}
            className="key"
            title="Fetch the model list from the endpoint"
            aria-label={`Refresh the ${scope} model list`}
          >
            <RefreshCw className="size-5" />
          </button>
        </div>
        <p className="text-sm text-dim">
          {modelsLive
            ? `Live list · ${models.length} model${models.length === 1 ? "" : "s"}`
            : (modelsDetail ?? "Preset guesses. Check the endpoint, then refresh.")}
        </p>
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-dim">Reasoning effort</legend>
        <div className="flex flex-wrap gap-1 rounded-xl border border-cabinet-edge bg-cabinet-sunken p-1">
          {effortLevels.map((effort: EffortLevel) => (
            <button
              key={effort}
              type="button"
              onClick={() => onPatch(scope, { effort })}
              aria-pressed={setting.effort === effort}
              className={cn(
                "flex-1 rounded-lg px-2 py-1 text-sm font-medium capitalize transition-colors",
                setting.effort === effort
                  ? "bg-amber text-strip-ink"
                  : "text-dim hover:bg-cabinet-raised hover:text-ivory",
              )}
              title={effort === "off" ? "Send no reasoning effort" : `reasoning_effort: ${effort}`}
            >
              {effort}
            </button>
          ))}
        </div>
      </fieldset>
    </section>
  )
}

type WriterPatch = Partial<Omit<Setting, "keyHint">> & { apiKey?: string }

const writerScopes: readonly WriterScope[] = ["style", "lyrics", "visuals"]

const writerTitles: Readonly<Record<WriterScope, string>> = {
  style: "Style",
  lyrics: "Lyrics",
  visuals: "Visuals",
}

const writerBlurbs: Readonly<Record<WriterScope, string>> = {
  style: "Sharpens the vibe you describe.",
  lyrics: "Extends, reworks, or writes the words.",
  visuals: "Writes a visualizer for each song.",
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

  useEscapeKey(onClose)

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
      <div className="absolute inset-0 bg-cabinet-sunken/75 backdrop-blur-sm" onClick={onClose} />

      <div className="cabinet panel-rise relative max-h-[88vh] w-full max-w-6xl space-y-6 overflow-y-auto rounded-3xl p-6 sm:p-8">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-5xl leading-none font-black tracking-tight text-amber uppercase">
              Ghostwriters
            </h2>
            <p className="mt-2 max-w-2xl text-base text-dim">
              The AI that helps with style, lyrics, and visuals. Any OpenAI-compatible endpoint
              works. Keys stay on this machine.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="key shrink-0"
            aria-label="Close AI settings"
            title="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        {config === undefined ? (
          <p className="pending-breathe text-base text-dim">Waking the ghostwriters…</p>
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
              className="cabinet-raised flex w-full items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left"
            >
              <span>
                <span className="block text-lg font-semibold text-ivory">Use AI ghostwriters</span>
                <span className="block text-base text-dim">
                  {config.enabled
                    ? "On. Enhance buttons, Surprise me, and Full auto are available."
                    : "Off. You write everything yourself, like it's 1958."}
                </span>
              </span>
              <span className={cn("switch", config.enabled && "on")}>
                <span className="switch-knob" />
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

              <p className="text-sm text-dim" aria-live="polite">
                {saveCount > 0 ? "Changes saved." : "Changes save as you type."}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
