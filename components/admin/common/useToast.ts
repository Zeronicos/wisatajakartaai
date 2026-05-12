'use client'

import { useCallback, useState } from "react"
import type { ToastItem } from "./ToastStack"

export function useToast() {
  const [items, setItems] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setItems((previous) => previous.filter((item) => item.id !== id))
  }, [])

  const show = useCallback((type: ToastItem["type"], message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setItems((previous) => [...previous, { id, type, message }])
    setTimeout(() => {
      setItems((previous) => previous.filter((item) => item.id !== id))
    }, 3000)
  }, [])

  return {
    items,
    dismiss,
    showSuccess: (message: string) => show("success", message),
    showError: (message: string) => show("error", message),
  }
}
