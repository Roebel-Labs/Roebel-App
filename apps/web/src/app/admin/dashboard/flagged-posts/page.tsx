"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Flag, CheckCircle, Trash2, User, Clock } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { CategoryBadge } from "@/components/app/CategoryBadge"
import {
  getFlaggedPosts,
  restoreFlaggedPost,
  deleteFlaggedPost,
  type FlaggedPost,
} from "@/app/actions/admin-posts"
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

export default function FlaggedPostsPage() {
  const { toast } = useToast()
  const [posts, setPosts] = useState<FlaggedPost[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const result = await getFlaggedPosts()
      if (result.success && result.data) {
        setPosts(result.data)
      } else {
        toast({
          title: "Fehler beim Laden",
          description: result.error || "Unbekannter Fehler",
          variant: "destructive",
        })
      }
    } catch {
      toast({
        title: "Fehler beim Laden",
        description: "Die Daten konnten nicht geladen werden.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleRestore = async (postId: string) => {
    const result = await restoreFlaggedPost(postId)
    if (result.success) {
      toast({ title: "Beitrag wiederhergestellt", description: "Der Beitrag ist wieder sichtbar." })
      fetchData()
    } else {
      toast({ title: "Fehler", description: result.error, variant: "destructive" })
    }
  }

  const handleDelete = async (postId: string) => {
    const result = await deleteFlaggedPost(postId)
    if (result.success) {
      toast({ title: "Beitrag gelöscht", description: "Der Beitrag wurde endgültig entfernt." })
      fetchData()
    } else {
      toast({ title: "Fehler", description: result.error, variant: "destructive" })
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="bg-card border border-border shadow-none">
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="bg-card border border-border shadow-none">
          <CardHeader>
            <Skeleton className="h-6 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-card border border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gemeldete Beiträge</CardTitle>
            <Flag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-medium">{posts.length}</div>
            <p className="text-xs text-muted-foreground">Warten auf Überprüfung</p>
          </CardContent>
        </Card>
      </div>

      {/* Flagged posts list */}
      <Card className="bg-card border border-border shadow-none">
        <CardHeader>
          <CardTitle>Gemeldete Beiträge überprüfen</CardTitle>
          <p className="text-sm text-muted-foreground">
            {posts.length} Beitrag{posts.length !== 1 ? "e" : ""} mit mindestens 3 Meldungen
          </p>
        </CardHeader>
        <CardContent>
          {posts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Flag className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Keine gemeldeten Beiträge</p>
              <p className="text-sm">Alles in Ordnung! Neue Meldungen erscheinen hier.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="border border-border rounded-lg p-4"
                >
                  {/* Post header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {post.author_profile_picture_url ? (
                          <img
                            src={post.author_profile_picture_url}
                            alt=""
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {post.author_username || `${post.wallet_address.slice(0, 6)}...${post.wallet_address.slice(-4)}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(post.created_at).toLocaleDateString("de-DE", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestore(post.id)}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Wiederherstellen
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="destructive">
                            <Trash2 className="h-4 w-4 mr-1" />
                            Löschen
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Beitrag endgültig löschen?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Diese Aktion kann nicht rückgängig gemacht werden. Der Beitrag wird dauerhaft entfernt.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(post.id)}>
                              Löschen
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {/* Category + Content */}
                  {post.category && post.category !== "generell" && (
                    <div className="mb-2">
                      <CategoryBadge category={post.category} />
                    </div>
                  )}
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words mb-3">
                    {post.content}
                  </p>

                  {/* Report info */}
                  <div className="border-t border-border pt-3 mt-3">
                    <p className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-2">
                      <Flag className="h-3 w-3 inline mr-1" />
                      {post.report_count} Meldung{post.report_count !== 1 ? "en" : ""}
                    </p>
                    {post.reports.length > 0 && (
                      <div className="space-y-1">
                        {post.reports.map((report, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>
                              {`${report.reporter.slice(0, 6)}...${report.reporter.slice(-4)}`}
                              {report.reason && ` — "${report.reason}"`}
                              {" · "}
                              {new Date(report.created_at).toLocaleDateString("de-DE", {
                                day: "numeric",
                                month: "short",
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
