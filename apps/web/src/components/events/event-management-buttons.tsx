"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { approveEvent, rejectEvent, deleteEvent } from "@/app/actions/manage-events"
import { Loader2, Check, X, Trash2 } from "lucide-react"
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

interface EventManagementButtonsProps {
  eventId: string
  eventTitle: string
}

export function EventManagementButtons({ eventId, eventTitle }: EventManagementButtonsProps) {
  const [isApproving, setIsApproving] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()

  async function handleApprove() {
    setIsApproving(true)
    try {
      const result = await approveEvent(eventId)
      if (result.success) {
        toast({
          title: "Event Approved",
          description: result.message,
        })
      } else {
        toast({
          title: "Approval Failed",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Approval Failed",
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setIsApproving(false)
    }
  }

  async function handleReject() {
    setIsRejecting(true)
    try {
      const result = await rejectEvent(eventId)
      if (result.success) {
        toast({
          title: "Event Rejected",
          description: result.message,
        })
      } else {
        toast({
          title: "Rejection Failed",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Rejection Failed",
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setIsRejecting(false)
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    try {
      const result = await deleteEvent(eventId)
      if (result.success) {
        toast({
          title: "Event Deleted",
          description: result.message,
        })
      } else {
        toast({
          title: "Deletion Failed",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Deletion Failed",
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        className="bg-green-600 hover:bg-green-700"
        onClick={handleApprove}
        disabled={isApproving || isRejecting || isDeleting}
      >
        {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>

      <Button
        size="sm"
        variant="destructive"
        onClick={handleReject}
        disabled={isApproving || isRejecting || isDeleting}
      >
        {isRejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={isApproving || isRejecting || isDeleting}>
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete &quot;{eventTitle}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
