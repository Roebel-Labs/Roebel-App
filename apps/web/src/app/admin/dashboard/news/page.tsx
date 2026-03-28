"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { Plus, Search, Eye, Edit, Trash2, Star, Calendar } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { deleteNewsArticle, toggleFeaturedArticle, type NewsArticle } from "@/app/actions/news"

export default function NewsPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [filteredArticles, setFilteredArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")

  const fetchArticles = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("news_articles")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) throw error

      setArticles(data || [])
    } catch (error) {
      console.error("Error fetching articles:", error)
      toast.error("Fehler beim Laden der Artikel")
    } finally {
      setLoading(false)
    }
  }, [])

  const filterArticles = useCallback(() => {
    let filtered = articles

    if (searchTerm) {
      filtered = filtered.filter(
        (article) =>
          article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          article.excerpt?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((article) => article.status === statusFilter)
    }

    setFilteredArticles(filtered)
  }, [articles, searchTerm, statusFilter])

  useEffect(() => {
    fetchArticles()
  }, [fetchArticles])

  useEffect(() => {
    filterArticles()
  }, [filterArticles])

  const handleDelete = async (id: string) => {
    const loadingToast = toast.loading("Artikel wird gelöscht...")

    const result = await deleteNewsArticle(id)

    if (result.success) {
      toast.success("Artikel gelöscht", {
        id: loadingToast,
        description: result.message,
      })
      fetchArticles()
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  const handleToggleFeatured = async (id: string, is_featured: boolean) => {
    const loadingToast = toast.loading("Status wird aktualisiert...")

    const result = await toggleFeaturedArticle(id, is_featured)

    if (result.success) {
      toast.success("Status aktualisiert", {
        id: loadingToast,
        description: result.message,
      })
      fetchArticles()
    } else {
      toast.error("Fehler", {
        id: loadingToast,
        description: result.error,
      })
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <Badge className="bg-green-100 text-green-800">Veröffentlicht</Badge>
      case "draft":
        return <Badge variant="secondary">Entwurf</Badge>
      case "archived":
        return <Badge variant="outline">Archiviert</Badge>
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>

        {/* Search and Filter Skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-[200px]" />
        </div>

        {/* Articles List Skeleton */}
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-[10px] p-4">
              <div className="flex gap-4">
                <Skeleton className="w-20 h-20 rounded-[8px] flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium text-foreground">News & Blog</h1>
          <p className="text-muted-foreground mt-1">Verwalten Sie Nachrichten und Blogbeiträge</p>
        </div>
        <Button onClick={() => router.push("/admin/dashboard/news/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Neuer Artikel
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Artikel suchen..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="draft">Entwurf</SelectItem>
            <SelectItem value="published">Veröffentlicht</SelectItem>
            <SelectItem value="archived">Archiviert</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Articles List */}
      <div className="space-y-3">
        {filteredArticles.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-[10px]">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Keine Artikel gefunden</p>
            <Button variant="link" onClick={() => router.push("/admin/dashboard/news/new")} className="mt-2">
              Ersten Artikel erstellen
            </Button>
          </div>
        ) : (
          filteredArticles.map((article) => (
            <div
              key={article.id}
              className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex gap-4">
                {/* Thumbnail */}
                {article.cover_image_url && (
                  <div className="w-32 h-24 rounded-[8px] overflow-hidden flex-shrink-0 bg-muted">
                    <img
                      src={article.cover_image_url}
                      alt={article.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-lg">{article.title}</h3>
                        {getStatusBadge(article.status)}
                        {article.is_featured && (
                          <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        )}
                        {article.category && (
                          <Badge variant="outline" className="text-xs">
                            {article.category}
                          </Badge>
                        )}
                      </div>
                      {article.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{article.excerpt}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{article.author_name}</span>
                        <span>•</span>
                        <span>
                          {new Date(article.created_at).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                        <span>•</span>
                        <span>{article.view_count} Aufrufe</span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/news/${article.slug}`)}
                      >
                        <Eye className="h-4 w-4 mr-1.5" />
                        Ansehen
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/admin/dashboard/news/${article.id}/edit`)}
                      >
                        <Edit className="h-4 w-4 mr-1.5" />
                        Bearbeiten
                      </Button>

                      <Button
                        size="sm"
                        variant={article.is_featured ? "default" : "outline"}
                        onClick={() => handleToggleFeatured(article.id, !article.is_featured)}
                        className="w-9 h-9 p-0"
                        title={article.is_featured ? "Featured entfernen" : "Als Featured markieren"}
                      >
                        <Star
                          className={`h-4 w-4 ${article.is_featured ? "fill-current" : ""}`}
                        />
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost">
                            <Trash2 className="h-4 w-4 mr-1.5" />
                            Löschen
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Artikel löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Diese Aktion kann nicht rückgängig gemacht werden. Der Artikel wird
                              dauerhaft gelöscht.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(article.id)}>
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
          ))
        )}
      </div>
    </div>
  )
}
