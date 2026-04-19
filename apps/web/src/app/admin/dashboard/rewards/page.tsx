"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Plus,
  Pencil,
  Trash2,
  Coins,
  Gift,
  Package,
  Sparkles,
  Save,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"

import {
  listRewardTasks,
  createRewardTask,
  updateRewardTask,
  deleteRewardTask,
  toggleRewardTaskPublished,
  listLootboxes,
  createLootbox,
  updateLootbox,
  deleteLootbox,
  listLootboxRewards,
  createLootboxReward,
  updateLootboxReward,
  deleteLootboxReward,
  listLootboxPool,
  upsertLootboxPoolRow,
  type RewardTask,
  type Lootbox,
  type LootboxReward,
  type LootboxRewardRarity,
  type LootboxRewardType,
} from "@/app/actions/rewards-admin"

type Tab = "tasks" | "lootboxes" | "rewards"

const REWARD_TYPES: { value: LootboxRewardType; label: string }[] = [
  { value: "profile_frame", label: "Profilrahmen" },
  { value: "sticker", label: "Sticker" },
  { value: "animated_sticker", label: "Animierter Sticker" },
  { value: "profile_banner", label: "Profilbanner" },
  { value: "badge", label: "Abzeichen" },
  { value: "coin_bundle", label: "Münzbundle" },
]

const RARITIES: { value: LootboxRewardRarity; label: string }[] = [
  { value: "common", label: "Gewöhnlich" },
  { value: "rare", label: "Selten" },
  { value: "epic", label: "Episch" },
  { value: "legendary", label: "Legendär" },
]

export default function RewardsAdminPage() {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>("tasks")
  const [tasks, setTasks] = useState<RewardTask[]>([])
  const [lootboxes, setLootboxes] = useState<Lootbox[]>([])
  const [rewards, setRewards] = useState<LootboxReward[]>([])
  const [loading, setLoading] = useState(true)

  const [taskDialog, setTaskDialog] = useState<{ open: boolean; task: RewardTask | null }>({
    open: false,
    task: null,
  })
  const [lootboxDialog, setLootboxDialog] = useState<{
    open: boolean
    lootbox: Lootbox | null
  }>({ open: false, lootbox: null })
  const [rewardDialog, setRewardDialog] = useState<{
    open: boolean
    reward: LootboxReward | null
  }>({ open: false, reward: null })
  const [poolDialog, setPoolDialog] = useState<{ open: boolean; lootbox: Lootbox | null }>({
    open: false,
    lootbox: null,
  })

  const refresh = useCallback(async () => {
    setLoading(true)
    const [t, lb, rw] = await Promise.all([
      listRewardTasks(),
      listLootboxes(),
      listLootboxRewards(),
    ])
    setTasks(t)
    setLootboxes(lb)
    setRewards(rw)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Belohnungen</h1>
          <p className="text-muted-foreground">
            Verwalte Aufgaben, Truhen und Belohnungs-Kataloge für die mobile App.
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} icon={<Coins className="h-4 w-4" />}>
          Aufgaben ({tasks.length})
        </TabButton>
        <TabButton
          active={tab === "lootboxes"}
          onClick={() => setTab("lootboxes")}
          icon={<Package className="h-4 w-4" />}
        >
          Truhen ({lootboxes.length})
        </TabButton>
        <TabButton
          active={tab === "rewards"}
          onClick={() => setTab("rewards")}
          icon={<Gift className="h-4 w-4" />}
        >
          Belohnungen ({rewards.length})
        </TabButton>
      </div>

      {tab === "tasks" && (
        <TasksTab
          tasks={tasks}
          loading={loading}
          onCreate={() => setTaskDialog({ open: true, task: null })}
          onEdit={(t) => setTaskDialog({ open: true, task: t })}
          onDelete={async (id) => {
            const res = await deleteRewardTask(id)
            toast({
              title: res.success ? "Gelöscht" : "Fehler",
              description: res.success ? "Aufgabe entfernt" : res.error,
              variant: res.success ? "default" : "destructive",
            })
            if (res.success) await refresh()
          }}
          onTogglePublished={async (id, next) => {
            const res = await toggleRewardTaskPublished(id, next)
            if (res.success) await refresh()
          }}
        />
      )}

      {tab === "lootboxes" && (
        <LootboxesTab
          lootboxes={lootboxes}
          loading={loading}
          onCreate={() => setLootboxDialog({ open: true, lootbox: null })}
          onEdit={(lb) => setLootboxDialog({ open: true, lootbox: lb })}
          onDelete={async (id) => {
            const res = await deleteLootbox(id)
            toast({
              title: res.success ? "Gelöscht" : "Fehler",
              description: res.success ? "Truhe entfernt" : res.error,
              variant: res.success ? "default" : "destructive",
            })
            if (res.success) await refresh()
          }}
          onEditPool={(lb) => setPoolDialog({ open: true, lootbox: lb })}
        />
      )}

      {tab === "rewards" && (
        <RewardsTab
          rewards={rewards}
          loading={loading}
          onCreate={() => setRewardDialog({ open: true, reward: null })}
          onEdit={(rw) => setRewardDialog({ open: true, reward: rw })}
          onDelete={async (id) => {
            const res = await deleteLootboxReward(id)
            toast({
              title: res.success ? "Gelöscht" : "Fehler",
              description: res.success ? "Belohnung entfernt" : res.error,
              variant: res.success ? "default" : "destructive",
            })
            if (res.success) await refresh()
          }}
        />
      )}

      <TaskDialog
        state={taskDialog}
        onClose={() => setTaskDialog({ open: false, task: null })}
        onSaved={async () => {
          await refresh()
          setTaskDialog({ open: false, task: null })
        }}
      />
      <LootboxDialog
        state={lootboxDialog}
        onClose={() => setLootboxDialog({ open: false, lootbox: null })}
        onSaved={async () => {
          await refresh()
          setLootboxDialog({ open: false, lootbox: null })
        }}
      />
      <RewardDialog
        state={rewardDialog}
        onClose={() => setRewardDialog({ open: false, reward: null })}
        onSaved={async () => {
          await refresh()
          setRewardDialog({ open: false, reward: null })
        }}
      />
      <PoolDialog
        state={poolDialog}
        rewards={rewards}
        onClose={() => setPoolDialog({ open: false, lootbox: null })}
      />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium transition-colors flex items-center gap-2 ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

// ── Tasks tab ──────────────────────────────────────────

function TasksTab({
  tasks,
  loading,
  onCreate,
  onEdit,
  onDelete,
  onTogglePublished,
}: {
  tasks: RewardTask[]
  loading: boolean
  onCreate: () => void
  onEdit: (t: RewardTask) => void
  onDelete: (id: string) => void
  onTogglePublished: (id: string, next: boolean) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Neue Aufgabe
        </Button>
      </div>
      {loading && tasks.length === 0 ? (
        <Skeleton className="h-40 w-full" />
      ) : tasks.length === 0 ? (
        <div className="text-center py-16 border rounded-lg bg-muted/30">
          <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Noch keine Aufgaben angelegt.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-4 p-3 border rounded-lg bg-card hover:bg-muted/30"
            >
              <div className="w-14 h-14 rounded-md bg-muted overflow-hidden flex-shrink-0">
                {t.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.image_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{t.title}</h3>
                  {t.is_repeatable && (
                    <Badge variant="secondary" className="text-xs">
                      wiederholbar
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  key: <code>{t.key}</code> · {t.coin_amount} M · {t.cta_route || "kein Ziel"}
                </p>
              </div>
              <Switch
                checked={t.is_published}
                onCheckedChange={(next) => onTogglePublished(t.id, next)}
              />
              <Button variant="ghost" size="icon" onClick={() => onEdit(t)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Aufgabe löschen?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Diese Aktion kann nicht rückgängig gemacht werden. Alle bestehenden
                      Fortschritte bleiben im Ledger erhalten.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(t.id)}>Löschen</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TaskDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { open: boolean; task: RewardTask | null }
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)
    form.set(
      "is_repeatable",
      form.get("is_repeatable") === "on" ? "true" : "false"
    )
    form.set(
      "is_published",
      form.get("is_published") === "on" ? "true" : "false"
    )
    const res = state.task
      ? await updateRewardTask(state.task.id, form)
      : await createRewardTask(form)
    setSaving(false)
    toast({
      title: res.success ? "Gespeichert" : "Fehler",
      description: res.success ? res.message : res.error,
      variant: res.success ? "default" : "destructive",
    })
    if (res.success) onSaved()
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{state.task ? "Aufgabe bearbeiten" : "Neue Aufgabe"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Key (stabiler Slug)">
            <Input name="key" defaultValue={state.task?.key} required disabled={!!state.task} />
          </Field>
          <Field label="Titel">
            <Input name="title" defaultValue={state.task?.title} required />
          </Field>
          <Field label="Beschreibung">
            <Textarea name="description" defaultValue={state.task?.description} required rows={3} />
          </Field>
          <Field label="Bild-URL">
            <Input name="image_url" defaultValue={state.task?.image_url || ""} placeholder="https://…" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Münzen">
              <Input name="coin_amount" type="number" min={0} defaultValue={state.task?.coin_amount ?? 50} />
            </Field>
            <Field label="Reihenfolge">
              <Input name="display_order" type="number" defaultValue={state.task?.display_order ?? 0} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CTA Label">
              <Input name="cta_label" defaultValue={state.task?.cta_label || "Mitmachen"} />
            </Field>
            <Field label="CTA Route (in-app)">
              <Input
                name="cta_route"
                defaultValue={state.task?.cta_route || ""}
                placeholder="/profile/edit"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Wiederholbar">
              <Switch
                name="is_repeatable"
                defaultChecked={state.task?.is_repeatable}
              />
            </Field>
            <Field label="Cooldown (Stunden)">
              <Input
                name="cooldown_hours"
                type="number"
                min={0}
                defaultValue={state.task?.cooldown_hours ?? 0}
              />
            </Field>
          </div>
          <Field label="Veröffentlicht">
            <Switch name="is_published" defaultChecked={state.task?.is_published} />
          </Field>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Lootboxes tab ──────────────────────────────────────

function LootboxesTab({
  lootboxes,
  loading,
  onCreate,
  onEdit,
  onDelete,
  onEditPool,
}: {
  lootboxes: Lootbox[]
  loading: boolean
  onCreate: () => void
  onEdit: (lb: Lootbox) => void
  onDelete: (id: string) => void
  onEditPool: (lb: Lootbox) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" /> Neue Truhe
        </Button>
      </div>
      {loading && lootboxes.length === 0 ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {lootboxes.map((lb) => (
            <div key={lb.id} className="border rounded-lg bg-card p-4 flex flex-col gap-2">
              <div className="aspect-square bg-muted rounded-md overflow-hidden">
                {lb.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lb.image_url} alt="" className="w-full h-full object-contain" />
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{lb.name}</h3>
                  <Badge variant={lb.is_published ? "default" : "secondary"}>
                    {lb.is_published ? "Live" : "Entwurf"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {lb.coins_per_key} Münzen / Schlüssel
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => onEditPool(lb)}>
                  Pool
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onEdit(lb)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Truhe löschen?</AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(lb.id)}>Löschen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LootboxDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { open: boolean; lootbox: Lootbox | null }
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)
    form.set("is_published", form.get("is_published") === "on" ? "true" : "false")
    const res = state.lootbox
      ? await updateLootbox(state.lootbox.id, form)
      : await createLootbox(form)
    setSaving(false)
    toast({
      title: res.success ? "Gespeichert" : "Fehler",
      description: res.success ? res.message : res.error,
      variant: res.success ? "default" : "destructive",
    })
    if (res.success) onSaved()
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{state.lootbox ? "Truhe bearbeiten" : "Neue Truhe"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name">
            <Input name="name" defaultValue={state.lootbox?.name} required />
          </Field>
          <Field label="Beschreibung">
            <Textarea name="description" defaultValue={state.lootbox?.description || ""} rows={2} />
          </Field>
          <Field label="Bild-URL">
            <Input name="image_url" defaultValue={state.lootbox?.image_url || ""} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Münzen pro Schlüssel">
              <Input
                name="coins_per_key"
                type="number"
                min={1}
                defaultValue={state.lootbox?.coins_per_key ?? 200}
              />
            </Field>
            <Field label="Reihenfolge">
              <Input
                name="display_order"
                type="number"
                defaultValue={state.lootbox?.display_order ?? 0}
              />
            </Field>
          </div>
          <Field label="Veröffentlicht">
            <Switch name="is_published" defaultChecked={state.lootbox?.is_published} />
          </Field>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Rewards tab ────────────────────────────────────────

function RewardsTab({
  rewards,
  loading,
  onCreate,
  onEdit,
  onDelete,
}: {
  rewards: LootboxReward[]
  loading: boolean
  onCreate: () => void
  onEdit: (r: LootboxReward) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" /> Neue Belohnung
        </Button>
      </div>
      {loading && rewards.length === 0 ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {rewards.map((r) => (
            <div key={r.id} className="border rounded-lg bg-card p-3 flex flex-col gap-2">
              <div className="aspect-square bg-muted rounded-md overflow-hidden">
                {r.asset_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.asset_url} alt="" className="w-full h-full object-contain" />
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm truncate">{r.name}</h3>
                  <Badge variant="outline">{r.rarity}</Badge>
                </div>
                <p className="text-xs text-muted-foreground capitalize">
                  {REWARD_TYPES.find((rt) => rt.value === r.type)?.label || r.type}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => onEdit(r)}>
                  Bearbeiten
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Belohnung löschen?</AlertDialogTitle>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(r.id)}>Löschen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function RewardDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { open: boolean; reward: LootboxReward | null }
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<LootboxRewardType>(
    state.reward?.type || "sticker"
  )

  useEffect(() => {
    setType(state.reward?.type || "sticker")
  }, [state.reward])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const form = new FormData(e.currentTarget)
    form.set("type", type)
    const res = state.reward
      ? await updateLootboxReward(state.reward.id, form)
      : await createLootboxReward(form)
    setSaving(false)
    toast({
      title: res.success ? "Gespeichert" : "Fehler",
      description: res.success ? res.message : res.error,
      variant: res.success ? "default" : "destructive",
    })
    if (res.success) onSaved()
  }

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {state.reward ? "Belohnung bearbeiten" : "Neue Belohnung"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Name">
            <Input name="name" defaultValue={state.reward?.name} required />
          </Field>
          <Field label="Typ">
            <Select value={type} onValueChange={(v) => setType(v as LootboxRewardType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REWARD_TYPES.map((rt) => (
                  <SelectItem key={rt.value} value={rt.value}>
                    {rt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Seltenheit">
            <Select name="rarity" defaultValue={state.reward?.rarity || "common"}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RARITIES.map((rt) => (
                  <SelectItem key={rt.value} value={rt.value}>
                    {rt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Asset URL (Bild / Lottie)">
            <Input name="asset_url" defaultValue={state.reward?.asset_url} required />
          </Field>
          <Field label="Beschreibung">
            <Textarea name="description" defaultValue={state.reward?.description || ""} rows={2} />
          </Field>
          {type === "coin_bundle" && (
            <Field label="Münzwert">
              <Input name="coin_value" type="number" min={1} defaultValue={state.reward?.coin_value ?? 100} />
            </Field>
          )}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 mr-2" /> Speichern
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Pool dialog ────────────────────────────────────────

function PoolDialog({
  state,
  rewards,
  onClose,
}: {
  state: { open: boolean; lootbox: Lootbox | null }
  rewards: LootboxReward[]
  onClose: () => void
}) {
  const { toast } = useToast()
  const [weights, setWeights] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!state.open || !state.lootbox) return
    setLoading(true)
    listLootboxPool(state.lootbox.id).then((rows) => {
      const map: Record<string, number> = {}
      rows.forEach((r) => {
        map[r.reward_id] = r.weight
      })
      setWeights(map)
      setLoading(false)
    })
  }, [state.open, state.lootbox])

  async function saveAll() {
    if (!state.lootbox) return
    setSaving(true)
    const results = await Promise.all(
      rewards.map((r) =>
        upsertLootboxPoolRow(state.lootbox!.id, r.id, weights[r.id] ?? 0)
      )
    )
    setSaving(false)
    const failed = results.filter((r) => !r.success)
    toast({
      title: failed.length === 0 ? "Pool gespeichert" : "Einige Änderungen fehlgeschlagen",
      description: `${rewards.length - failed.length}/${rewards.length} aktualisiert`,
      variant: failed.length === 0 ? "default" : "destructive",
    })
    if (failed.length === 0) onClose()
  }

  const totalWeight = useMemo(
    () => Object.values(weights).reduce((sum, v) => sum + (v || 0), 0),
    [weights]
  )

  return (
    <Dialog open={state.open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pool: {state.lootbox?.name}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Setze die Gewichtung pro Belohnung. 0 = nicht im Pool. Gesamt: {totalWeight}
        </p>
        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="space-y-2">
            {rewards.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-2 border rounded-md">
                <div className="w-10 h-10 bg-muted rounded overflow-hidden">
                  {r.asset_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.asset_url} alt="" className="w-full h-full object-contain" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{r.name}</span>
                    <Badge variant="outline" className="text-xs">
                      {r.rarity}
                    </Badge>
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  className="w-20"
                  value={weights[r.id] ?? 0}
                  onChange={(e) =>
                    setWeights({ ...weights, [r.id]: Number(e.target.value) })
                  }
                />
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={saveAll} disabled={saving}>
            <Save className="h-4 w-4 mr-2" /> Pool speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Shared form field ──────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
