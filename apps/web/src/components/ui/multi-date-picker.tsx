"use client"

import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  generateRecurringDates,
  formatDateToString,
  formatDateForDisplay,
  type RecurrencePattern,
} from "@/lib/utils/recurring-events"

interface MultiDatePickerProps {
  selectedDates: string[]
  onDatesChange: (dates: string[]) => void
  minDate?: string
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]
const MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
]

export function MultiDatePicker({ selectedDates, onDatesChange, minDate }: MultiDatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [patternEndDate, setPatternEndDate] = useState("")

  const minDateObj = useMemo(() => minDate ? new Date(minDate) : null, [minDate])

  // Generate calendar days for current month
  const calendarDays = useMemo(() => {
    const { year, month } = currentMonth
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // Get the day of week for the first day (0 = Sunday, convert to Monday = 0)
    let startDayOfWeek = firstDay.getDay() - 1
    if (startDayOfWeek < 0) startDayOfWeek = 6

    const days: (Date | null)[] = []

    // Add empty slots for days before the first day of month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }

    // Add all days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      days.push(new Date(year, month, day))
    }

    return days
  }, [currentMonth])

  const handlePrevMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 }
      }
      return { ...prev, month: prev.month - 1 }
    })
  }

  const handleNextMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 }
      }
      return { ...prev, month: prev.month + 1 }
    })
  }

  const handleDayClick = (date: Date) => {
    const dateStr = formatDateToString(date)

    if (selectedDates.includes(dateStr)) {
      onDatesChange(selectedDates.filter(d => d !== dateStr))
    } else {
      onDatesChange([...selectedDates, dateStr].sort())
    }
  }

  const handleRemoveDate = (dateStr: string) => {
    onDatesChange(selectedDates.filter(d => d !== dateStr))
  }

  const handleGeneratePattern = (pattern: RecurrencePattern) => {
    if (selectedDates.length === 0) return

    // Use the first selected date as start
    const startDate = new Date(selectedDates[0])

    // Use pattern end date or default to 3 months from start
    let endDate: Date
    if (patternEndDate) {
      endDate = new Date(patternEndDate)
    } else {
      endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + 3)
    }

    if (endDate <= startDate) return

    const generatedDates = generateRecurringDates(startDate, pattern, endDate)

    // Merge with existing dates and remove duplicates
    const allDates = [...new Set([...selectedDates, ...generatedDates])].sort()
    onDatesChange(allDates)
  }

  const isDateDisabled = (date: Date): boolean => {
    if (!minDateObj) return false
    const dateOnly = new Date(date)
    dateOnly.setHours(0, 0, 0, 0)
    const minOnly = new Date(minDateObj)
    minOnly.setHours(0, 0, 0, 0)
    return dateOnly < minOnly
  }

  const isDateSelected = (date: Date): boolean => {
    return selectedDates.includes(formatDateToString(date))
  }

  return (
    <div className="space-y-4">
      {/* Calendar */}
      <div className="bg-card border border-border rounded-lg p-4">
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handlePrevMonth}
            className="p-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium">
            {MONTHS[currentMonth.month]} {currentMonth.year}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleNextMonth}
            className="p-2"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEKDAYS.map(day => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground py-1"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="h-9" />
            }

            const disabled = isDateDisabled(date)
            const selected = isDateSelected(date)

            return (
              <button
                key={date.toISOString()}
                type="button"
                disabled={disabled}
                onClick={() => handleDayClick(date)}
                className={`
                  h-9 w-full rounded-lg text-sm font-medium transition-colors
                  ${disabled
                    ? "text-muted-foreground cursor-not-allowed"
                    : selected
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "hover:bg-accent text-foreground"
                  }
                `}
              >
                {date.getDate()}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected dates badges */}
      {selectedDates.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium text-foreground">
            Ausgewählt ({selectedDates.length} Termine)
          </Label>
          <div className="flex flex-wrap gap-2">
            {selectedDates.map(dateStr => (
              <div
                key={dateStr}
                className="inline-flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm"
              >
                {formatDateForDisplay(dateStr)}
                <button
                  type="button"
                  onClick={() => handleRemoveDate(dateStr)}
                  className="hover:bg-primary/20 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern generator */}
      <div className="space-y-3 pt-2 border-t border-border">
        <Label className="text-sm font-medium text-foreground">
          Muster generieren
        </Label>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleGeneratePattern("weekly")}
            disabled={selectedDates.length === 0}
            className="text-xs"
          >
            Wöchentlich
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleGeneratePattern("biweekly")}
            disabled={selectedDates.length === 0}
            className="text-xs"
          >
            Alle 2 Wochen
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleGeneratePattern("monthly")}
            disabled={selectedDates.length === 0}
            className="text-xs"
          >
            Monatlich
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleGeneratePattern("yearly")}
            disabled={selectedDates.length === 0}
            className="text-xs"
          >
            Jährlich
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="pattern-end-date" className="text-xs text-muted-foreground whitespace-nowrap">
            Bis:
          </Label>
          <Input
            id="pattern-end-date"
            type="date"
            value={patternEndDate}
            onChange={(e) => setPatternEndDate(e.target.value)}
            min={selectedDates[0] || minDate}
            className="text-sm h-8"
          />
        </div>

        {selectedDates.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Wählen Sie zuerst ein Startdatum, um ein Muster zu generieren
          </p>
        )}
      </div>
    </div>
  )
}
