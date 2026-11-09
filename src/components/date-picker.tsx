"use client"

import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog"

type SingleValue = string
export type RangeValue = {
  from?: string
  to?: string
}

type DatePickerProps =
  | {
      mode?: "single"
      value?: SingleValue
      onChange: React.Dispatch<React.SetStateAction<string>>
      placeholder?: string
      className?: string
      disabled?: boolean
      maxDate?: Date
      style?: React.CSSProperties
    }
  | {
      mode: "range"
      value?: RangeValue
      onChange: React.Dispatch<React.SetStateAction<RangeValue>>
      placeholder?: string
      className?: string
      disabled?: boolean
      maxDate?: Date
      style?: React.CSSProperties
    }

function parseDateValue(value: string): Date | undefined {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnlyMatch) {
    return new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
  }

  const date = new Date(value)
  return isNaN(date.getTime()) ? undefined : date
}

export function DatePicker(props: DatePickerProps) {
  const {
    mode = "single",
    placeholder = "Pick a date",
    className,
    disabled,
    style,
  } = props as any

  const [open, setOpen] = React.useState(false)

  // -----------------------------
  // SINGLE MODE
  // -----------------------------
  if (mode === "single") {
    const { value, onChange } = props as Extract<
      DatePickerProps,
      { mode?: "single" }
    >

    const selectedDate = React.useMemo(() => {
      if (!value) return undefined
      return parseDateValue(value)
      //const d = new Date(value)
      //return isNaN(d.getTime()) ? undefined : d
    }, [value])

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            style={{ width: "fit-content", height: "1.9rem", ...style }}
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-[180px] justify-start text-left font-normal",
              !value && "text-muted-foreground",
              className
            )}
          >
            {/* <CalendarIcon className="mr-2 h-2 w-2" /> */}
            {selectedDate ? format(selectedDate, "PPP") : placeholder}
          </Button>
        </DialogTrigger>

        <DialogContent className="w-auto p-0 border-none bg-transparent shadow-none">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              onChange(date ? format(date, "yyyy-MM-dd") : "")
              setOpen(false)
            }}
            disabled={props.maxDate ? { after: props.maxDate } : undefined}
          />
        </DialogContent>
      </Dialog>
    )
  }

  // -----------------------------
  // RANGE MODE
  // -----------------------------
  const { value, onChange } = props as Extract<
    DatePickerProps,
    { mode: "range" }
  >

  const selectedRange = React.useMemo(() => {
    return {
      from: value?.from ? parseDateValue(value.from) : undefined,
      to: value?.to ? parseDateValue(value.to) : undefined,
      //from: value?.from ? new Date(value.from) : undefined,
      //to: value?.to ? new Date(value.to) : undefined,
    }
  }, [value])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          style={{ border: "", width: "fit-content", ...style }}
          className={cn(
            " justify-start text-left font-normal",
            !value?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value?.from ? (
            value?.to ? (
              `${format(parseDateValue(value.from)!, "PPP")} - ${format(
                parseDateValue(value.to)!,
                "PPP"
              )}`
            ) : (
              format(parseDateValue(value.from)!, "PPP")
            )
          ) : (
            placeholder
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="w-auto p-0 border-none bg-transparent shadow-none">
        <Calendar
          mode="range"
          selected={selectedRange}
          onSelect={(range: any) => {
            onChange({
              from: range?.from
                ? format(range.from, "yyyy-MM-dd")
                : undefined,
              to: range?.to
                ? format(range.to, "yyyy-MM-dd")
                : undefined,
            })

            // optional: close when full range selected
            if (range?.from && range?.to) {
              setOpen(false)
            }
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
