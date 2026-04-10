"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
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
import {
  Plus,
  Search,
  Edit,
  Trash2,
  FolderOpen,
  FileText,
  Video,
  Layers,
  Star,
  ExternalLink,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import {
  deleteSection,
  togglePublishSection,
  deleteCollection,
  togglePublishCollection,
  deleteItem,
  togglePublishItem,
  deleteVideo,
  togglePublishVideo,
  type HelpSection,
  type HelpCollection,
  type HelpItem,
  type HelpVideo,
} from "@/app/actions/help-hub"

type Tab = "sections" | "collections" | "items" | "videos"

export default function HelpHubPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>("sections")

  // Sections state
  const [sections, setSections] = useState<HelpSection[]>([])
  const [filteredSections, setFilteredSections] = useState<HelpSection[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(true)
  const [sectionsSearch, setSectionsSearch] = useState("")
  const [sectionsPublishFilter, setSectionsPublishFilter] = useState("all")

  // Collections state
  const [collections, setCollections] = useState<HelpCollection[]>([])
  const [filteredCollections, setFilteredCollections] = useState<HelpCollection[]>([])
  const [collectionsLoading, setCollectionsLoading] = useState(true)
  const [collectionsSearch, setCollectionsSearch] = useState("")
  const [collectionsPublishFilter, setCollectionsPublishFilter] = useState("all")
  const [collectionsSectionFilter, setCollectionsSectionFilter] = useState("all")

  // Items state
  const [items, setItems] = useState<HelpItem[]>([])
  const [filteredItems, setFilteredItems] = useState<HelpItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [itemsSearch, setItemsSearch] = useState("")
  const [itemsPublishFilter, setItemsPublishFilter] = useState("all")
  const [itemsCollectionFilter, setItemsCollectionFilter] = useState("all")

  // Videos state
  const [videos, setVideos] = useState<HelpVideo[]>([])
  const [filteredVideos, setFilteredVideos] = useState<HelpVideo[]>([])
  const [videosLoading, setVideosLoading] = useState(true)
  const [videosSearch, setVideosSearch] = useState("")
  const [videosPublishFilter, setVideosPublishFilter] = useState("all")

  // ── Fetch ────────────────────────────────────────────

  const fetchSections = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("help_sections")
        .select("*")
        .order("display_order", { ascending: true })
      if (error) throw error
      setSections((data || []) as HelpSection[])
    } catch (error) {
      console.error("Error fetching sections:", error)
      toast.error("Fehler beim Laden der Bereiche")
    } finally {
      setSectionsLoading(false)
    }
  }, [])

  const fetchCollections = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("help_collections")
        .select("*, help_sections(title, view_mode)")
        .order("display_order", { ascending: true })
      if (error) throw error
      setCollections((data || []) as HelpCollection[])
    } catch (error) {
      console.error("Error fetching collections:", error)
      toast.error("Fehler beim Laden der Sammlungen")
    } finally {
      setCollectionsLoading(false)
    }
  }, [])

  const fetchItems = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("help_items")
        .select("*, help_collections(title)")
        .order("display_order", { ascending: true })
      if (error) throw error
      setItems((data || []) as HelpItem[])
    } catch (error) {
      console.error("Error fetching items:", error)
      toast.error("Fehler beim Laden der Hilfe-Artikel")
    } finally {
      setItemsLoading(false)
    }
  }, [])

  const fetchVideos = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("help_videos")
        .select("*")
        .order("display_order", { ascending: true })
      if (error) throw error
      setVideos((data || []) as HelpVideo[])
    } catch (error) {
      console.error("Error fetching videos:", error)
      toast.error("Fehler beim Laden der Videos")
    } finally {
      setVideosLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSections()
    fetchCollections()
    fetchItems()
    fetchVideos()
  }, [fetchSections, fetchCollections, fetchItems, fetchVideos])

  // ── Filters ──────────────────────────────────────────

  useEffect(() => {
    let filtered = sections
    if (sectionsSearch) {
      filtered = filtered.filter((s) =>
        s.title.toLowerCase().includes(sectionsSearch.toLowerCase())
      )
    }
    if (sectionsPublishFilter !== "all") {
      filtered = filtered.filter((s) =>
        sectionsPublishFilter === "published" ? s.is_published : !s.is_published
      )
    }
    setFilteredSections(filtered)
  }, [sections, sectionsSearch, sectionsPublishFilter])

  useEffect(() => {
    let filtered = collections
    if (collectionsSearch) {
      filtered = filtered.filter((c) =>
        c.title.toLowerCase().includes(collectionsSearch.toLowerCase())
      )
    }
    if (collectionsPublishFilter !== "all") {
      filtered = filtered.filter((c) =>
        collectionsPublishFilter === "published" ? c.is_published : !c.is_published
      )
    }
    if (collectionsSectionFilter !== "all") {
      if (collectionsSectionFilter === "none") {
        filtered = filtered.filter((c) => !c.section_id)
      } else {
        filtered = filtered.filter((c) => c.section_id === collectionsSectionFilter)
      }
    }
    setFilteredCollections(filtered)
  }, [collections, collectionsSearch, collectionsPublishFilter, collectionsSectionFilter])

  useEffect(() => {
    let filtered = items
    if (itemsSearch) {
      filtered = filtered.filter((i) =>
        i.title.toLowerCase().includes(itemsSearch.toLowerCase())
      )
    }
    if (itemsPublishFilter !== "all") {
      filtered = filtered.filter((i) =>
        itemsPublishFilter === "published" ? i.is_published : !i.is_published
      )
    }
    if (itemsCollectionFilter !== "all") {
      filtered = filtered.filter((i) => i.collection_id === itemsCollectionFilter)
    }
    setFilteredItems(filtered)
  }, [items, itemsSearch, itemsPublishFilter, itemsCollectionFilter])

  useEffect(() => {
    let filtered = videos
    if (videosSearch) {
      filtered = filtered.filter((v) =>
        v.title.toLowerCase().includes(videosSearch.toLowerCase())
      )
    }
    if (videosPublishFilter !== "all") {
      filtered = filtered.filter((v) =>
        videosPublishFilter === "published" ? v.is_published : !v.is_published
      )
    }
    setFilteredVideos(filtered)
  }, [videos, videosSearch, videosPublishFilter])

  // ── Actions ──────────────────────────────────────────

  const handleDeleteSection = async (id: string) => {
    const loadingToast = toast.loading("Bereich wird gelöscht...")
    const result = await deleteSection(id)
    if (result.success) {
      toast.success("Bereich gelöscht", { id: loadingToast, description: result.message })
      fetchSections()
      fetchCollections() // section_id on collections becomes null
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleToggleSection = async (id: string, isPublished: boolean) => {
    const result = await togglePublishSection(id, isPublished)
    if (result.success) {
      toast.success(result.message)
      fetchSections()
    } else {
      toast.error(result.error || "Fehler beim Ändern des Status")
    }
  }

  const handleDeleteCollection = async (id: string) => {
    const loadingToast = toast.loading("Sammlung wird gelöscht...")
    const result = await deleteCollection(id)
    if (result.success) {
      toast.success("Sammlung gelöscht", { id: loadingToast, description: result.message })
      fetchCollections()
      fetchItems() // items may have been cascade-deleted
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleToggleCollection = async (id: string, isPublished: boolean) => {
    const result = await togglePublishCollection(id, isPublished)
    if (result.success) {
      toast.success(result.message)
      fetchCollections()
    } else {
      toast.error(result.error || "Fehler beim Ändern des Status")
    }
  }

  const handleDeleteItem = async (id: string) => {
    const loadingToast = toast.loading("Artikel wird gelöscht...")
    const result = await deleteItem(id)
    if (result.success) {
      toast.success("Artikel gelöscht", { id: loadingToast, description: result.message })
      fetchItems()
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleToggleItem = async (id: string, isPublished: boolean) => {
    const result = await togglePublishItem(id, isPublished)
    if (result.success) {
      toast.success(result.message)
      fetchItems()
    } else {
      toast.error(result.error || "Fehler beim Ändern des Status")
    }
  }

  const handleDeleteVideo = async (id: string) => {
    const loadingToast = toast.loading("Video wird gelöscht...")
    const result = await deleteVideo(id)
    if (result.success) {
      toast.success("Video gelöscht", { id: loadingToast, description: result.message })
      fetchVideos()
    } else {
      toast.error("Fehler", { id: loadingToast, description: result.error })
    }
  }

  const handleToggleVideo = async (id: string, isPublished: boolean) => {
    const result = await togglePublishVideo(id, isPublished)
    if (result.success) {
      toast.success(result.message)
      fetchVideos()
    } else {
      toast.error(result.error || "Fehler beim Ändern des Status")
    }
  }

  // ── Helpers ──────────────────────────────────────────

  const getPublishBadge = (isPublished: boolean) =>
    isPublished ? (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Veröffentlicht</Badge>
    ) : (
      <Badge className="bg-muted text-foreground hover:bg-accent">Entwurf</Badge>
    )

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "sections", label: "Bereiche", icon: <Layers className="h-4 w-4" /> },
    { key: "collections", label: "Sammlungen", icon: <FolderOpen className="h-4 w-4" /> },
    { key: "items", label: "Hilfe-Artikel", icon: <FileText className="h-4 w-4" /> },
    { key: "videos", label: "Videos", icon: <Video className="h-4 w-4" /> },
  ]

  // ── Render ───────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium text-foreground">Hilfe & Tipps</h1>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie den Hilfe-Bereich der App
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
              activeTab === tab.key
                ? "bg-card border border-b-0 border-border text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sections Tab */}
      {activeTab === "sections" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Bereich suchen..."
                value={sectionsSearch}
                onChange={(e) => setSectionsSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={sectionsPublishFilter} onValueChange={setSectionsPublishFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="published">Veröffentlicht</SelectItem>
                <SelectItem value="draft">Entwurf</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => router.push("/admin/dashboard/help/sections/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Bereich
            </Button>
          </div>

          {/* List */}
          {sectionsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : filteredSections.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-[10px]">
              <Layers className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Keine Bereiche gefunden</p>
              <Button
                variant="link"
                onClick={() => router.push("/admin/dashboard/help/sections/new")}
                className="mt-2"
              >
                Ersten Bereich erstellen
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSections.map((section) => (
                <div
                  key={section.id}
                  className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-medium text-lg">{section.title}</h3>
                        {getPublishBadge(section.is_published)}
                        <Badge variant="outline">
                          {section.view_mode === "list" ? "Liste" : "Grid"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Reihenfolge: {section.display_order}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Switch
                        checked={section.is_published}
                        onCheckedChange={(checked) => handleToggleSection(section.id, checked)}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          router.push(`/admin/dashboard/help/sections/${section.id}/edit`)
                        }
                      >
                        <Edit className="h-4 w-4 mr-1.5" />
                        Bearbeiten
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Bereich löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Möchten Sie &quot;{section.title}&quot; wirklich löschen? Zugehörige
                              Sammlungen werden nicht gelöscht, aber ihre Zuordnung wird entfernt.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteSection(section.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collections Tab */}
      {activeTab === "collections" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sammlung suchen..."
                value={collectionsSearch}
                onChange={(e) => setCollectionsSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={collectionsPublishFilter} onValueChange={setCollectionsPublishFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="published">Veröffentlicht</SelectItem>
                <SelectItem value="draft">Entwurf</SelectItem>
              </SelectContent>
            </Select>
            <Select value={collectionsSectionFilter} onValueChange={setCollectionsSectionFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Bereich" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Bereiche</SelectItem>
                <SelectItem value="none">Ohne Bereich</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => router.push("/admin/dashboard/help/collections/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Neue Sammlung
            </Button>
          </div>

          {/* List */}
          {collectionsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : filteredCollections.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-[10px]">
              <FolderOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Keine Sammlungen gefunden</p>
              <Button
                variant="link"
                onClick={() => router.push("/admin/dashboard/help/collections/new")}
                className="mt-2"
              >
                Erste Sammlung erstellen
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCollections.map((collection) => (
                <div
                  key={collection.id}
                  className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-4">
                    {collection.cover_image_url && (
                      <div className="w-24 h-16 rounded-[8px] overflow-hidden flex-shrink-0 bg-muted">
                        <img
                          src={collection.cover_image_url}
                          alt={collection.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-medium text-lg">{collection.title}</h3>
                            {getPublishBadge(collection.is_published)}
                            {collection.is_featured && (
                              <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                                <Star className="h-3 w-3 mr-1" />
                                Hervorgehoben
                              </Badge>
                            )}
                          </div>
                          {collection.subtitle && (
                            <p className="text-sm text-muted-foreground">{collection.subtitle}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Bereich: {collection.help_sections?.title || "–"} · Reihenfolge:{" "}
                            {collection.display_order}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <Switch
                            checked={collection.is_published}
                            onCheckedChange={(checked) =>
                              handleToggleCollection(collection.id, checked)
                            }
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              router.push(`/admin/dashboard/help/collections/${collection.id}/edit`)
                            }
                          >
                            <Edit className="h-4 w-4 mr-1.5" />
                            Bearbeiten
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Sammlung löschen?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Möchten Sie &quot;{collection.title}&quot; wirklich löschen? Alle
                                  zugehörigen Hilfe-Artikel werden ebenfalls gelöscht. Diese Aktion
                                  kann nicht rückgängig gemacht werden.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteCollection(collection.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Löschen
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Items Tab */}
      {activeTab === "items" && (
        <div className="space-y-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Artikel suchen..."
                value={itemsSearch}
                onChange={(e) => setItemsSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={itemsPublishFilter} onValueChange={setItemsPublishFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="published">Veröffentlicht</SelectItem>
                <SelectItem value="draft">Entwurf</SelectItem>
              </SelectContent>
            </Select>
            <Select value={itemsCollectionFilter} onValueChange={setItemsCollectionFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sammlung" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Sammlungen</SelectItem>
                {collections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => router.push("/admin/dashboard/help/items/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Artikel
            </Button>
          </div>

          {itemsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-[10px]">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Keine Hilfe-Artikel gefunden</p>
              <Button
                variant="link"
                onClick={() => router.push("/admin/dashboard/help/items/new")}
                className="mt-2"
              >
                Ersten Artikel erstellen
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-4">
                    {item.icon_url && (
                      <div className="w-12 h-12 rounded-[8px] overflow-hidden flex-shrink-0 bg-muted">
                        <img
                          src={item.icon_url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-medium">{item.title}</h3>
                            {getPublishBadge(item.is_published)}
                            <Badge variant="outline">
                              {item.hero_media_type === "video" ? "Video" : "Bild"}
                            </Badge>
                          </div>
                          {item.subtitle && (
                            <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Sammlung:{" "}
                            {item.help_collections?.title || "–"} · Reihenfolge: {item.display_order}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <Switch
                            checked={item.is_published}
                            onCheckedChange={(checked) => handleToggleItem(item.id, checked)}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              router.push(`/admin/dashboard/help/items/${item.id}/edit`)
                            }
                          >
                            <Edit className="h-4 w-4 mr-1.5" />
                            Bearbeiten
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Artikel löschen?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Möchten Sie &quot;{item.title}&quot; wirklich löschen? Diese
                                  Aktion kann nicht rückgängig gemacht werden.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Löschen
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Videos Tab */}
      {activeTab === "videos" && (
        <div className="space-y-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Video suchen..."
                value={videosSearch}
                onChange={(e) => setVideosSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={videosPublishFilter} onValueChange={setVideosPublishFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="published">Veröffentlicht</SelectItem>
                <SelectItem value="draft">Entwurf</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => router.push("/admin/dashboard/help/videos/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Neues Video
            </Button>
          </div>

          {videosLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-[10px]">
              <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">Keine Videos gefunden</p>
              <Button
                variant="link"
                onClick={() => router.push("/admin/dashboard/help/videos/new")}
                className="mt-2"
              >
                Erstes Video erstellen
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVideos.map((video) => (
                <div
                  key={video.id}
                  className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex gap-4">
                    {video.thumbnail_url && (
                      <div className="w-32 h-20 rounded-[8px] overflow-hidden flex-shrink-0 bg-muted">
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-medium">{video.title}</h3>
                            {getPublishBadge(video.is_published)}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{video.duration}</span>
                            <span>
                              {new Date(video.published_date).toLocaleDateString("de-DE", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </span>
                            <a
                              href={video.youtube_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              YouTube
                            </a>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Reihenfolge: {video.display_order}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <Switch
                            checked={video.is_published}
                            onCheckedChange={(checked) => handleToggleVideo(video.id, checked)}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              router.push(`/admin/dashboard/help/videos/${video.id}/edit`)
                            }
                          >
                            <Edit className="h-4 w-4 mr-1.5" />
                            Bearbeiten
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Video löschen?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Möchten Sie &quot;{video.title}&quot; wirklich löschen? Diese
                                  Aktion kann nicht rückgängig gemacht werden.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteVideo(video.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  Löschen
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
