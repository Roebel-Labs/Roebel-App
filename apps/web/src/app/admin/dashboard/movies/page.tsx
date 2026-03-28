"use client"

import { useEffect, useState } from "react"
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
import { Plus, Search, Eye, Edit, Trash2, Calendar, Film as FilmIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { deleteMovie, type Movie } from "@/app/actions/movies"

export default function MoviesPage() {
  const router = useRouter()
  const [movies, setMovies] = useState<Movie[]>([])
  const [filteredMovies, setFilteredMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [fskFilter, setFskFilter] = useState("all")

  useEffect(() => {
    fetchMovies()
  }, [])

  useEffect(() => {
    filterMovies()
  }, [movies, searchTerm, statusFilter, fskFilter])

  const fetchMovies = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("movies")
        .select("*")
        .order("date", { ascending: true })

      if (error) throw error

      setMovies(data || [])
    } catch (error) {
      console.error("Error fetching movies:", error)
      toast.error("Fehler beim Laden der Filme")
    } finally {
      setLoading(false)
    }
  }

  const filterMovies = () => {
    let filtered = movies

    if (searchTerm) {
      filtered = filtered.filter((movie) =>
        movie.title.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((movie) => movie.status === statusFilter)
    }

    if (fskFilter !== "all") {
      filtered = filtered.filter((movie) => movie.fsk === fskFilter)
    }

    setFilteredMovies(filtered)
  }

  const handleDelete = async (id: string) => {
    const loadingToast = toast.loading("Film wird gelöscht...")

    const result = await deleteMovie(id)

    if (result.success) {
      toast.success("Film gelöscht", {
        id: loadingToast,
        description: result.message,
      })
      fetchMovies()
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
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Veröffentlicht</Badge>
      case "draft":
        return <Badge className="bg-muted text-foreground hover:bg-accent">Entwurf</Badge>
      case "archived":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Archiviert</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const getFskBadge = (fsk: string | null) => {
    if (!fsk) return null

    const colors: Record<string, string> = {
      "FSK 0": "bg-green-100 text-green-800",
      "FSK 6": "bg-yellow-100 text-yellow-800",
      "FSK 12": "bg-orange-100 text-orange-800",
      "FSK 16": "bg-red-100 text-red-800",
      "FSK 18": "bg-purple-100 text-purple-800",
    }

    return (
      <Badge className={`${colors[fsk] || ""} hover:${colors[fsk] || ""}`}>
        {fsk}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-medium text-foreground">Kinoprogramm</h1>
          <p className="text-muted-foreground mt-1">Verwalten Sie das Kinoprogramm</p>
        </div>
        <Button onClick={() => router.push("/admin/dashboard/movies/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Neuer Film
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Film suchen..."
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
        <Select value={fskFilter} onValueChange={setFskFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="FSK" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle FSK</SelectItem>
            <SelectItem value="FSK 0">FSK 0</SelectItem>
            <SelectItem value="FSK 6">FSK 6</SelectItem>
            <SelectItem value="FSK 12">FSK 12</SelectItem>
            <SelectItem value="FSK 16">FSK 16</SelectItem>
            <SelectItem value="FSK 18">FSK 18</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Movies List */}
      <div className="space-y-3">
        {filteredMovies.length === 0 ? (
          <div className="text-center py-12 bg-card border border-border rounded-[10px]">
            <FilmIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Keine Filme gefunden</p>
            <Button
              variant="link"
              onClick={() => router.push("/admin/dashboard/movies/new")}
              className="mt-2"
            >
              Ersten Film hinzufügen
            </Button>
          </div>
        ) : (
          filteredMovies.map((movie) => (
            <div
              key={movie.id}
              className="bg-card border border-border rounded-[10px] p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex gap-4">
                {/* Cover Image */}
                {movie.cover_image_url && (
                  <div className="w-24 h-36 rounded-[8px] overflow-hidden flex-shrink-0 bg-muted">
                    <img
                      src={movie.cover_image_url}
                      alt={movie.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-medium text-lg">{movie.title}</h3>
                        {getStatusBadge(movie.status)}
                        {getFskBadge(movie.fsk)}
                      </div>
                      {movie.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {movie.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(movie.date).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {movie.time && (
                            <span className="ml-1">
                              um {movie.time.slice(0, 5)} Uhr
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => router.push(`/admin/dashboard/movies/${movie.id}/edit`)}
                      >
                        <Edit className="h-4 w-4 mr-1.5" />
                        Bearbeiten
                      </Button>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Film löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Möchten Sie &quot;{movie.title}&quot; wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(movie.id)}
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
          ))
        )}
      </div>
    </div>
  )
}
