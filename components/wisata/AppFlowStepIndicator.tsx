'use client'

import { useRouter } from 'next/navigation'
import { guardAppFlowStep } from '@/lib/appFlowGuard'

export const APP_FLOW_STEPS = [
  { title: 'Input Preferensi', short: '1', detail: 'Isi hotel dan preferensi perjalanan', href: '/planner' },
  { title: 'Review Cluster', short: '2', detail: 'Tinjau hasil cluster destinasi', href: '/cluster' },
  { title: 'Finalisasi Itinerary', short: '3', detail: 'Atur timeline, peta, dan cetak', href: '/itinerary' },
] as const

type AppFlowStepIndicatorProps = {
  activeStep: 0 | 1 | 2
  className?: string
}

export default function AppFlowStepIndicator({ activeStep, className = '' }: AppFlowStepIndicatorProps) {
  const router = useRouter()

  return (
    <div className={`rounded-2xl border border-border bg-card p-4 shadow-sm ${className}`.trim()}>
      <div className="flex flex-col gap-2">
        <div className="app-flow-steps-scroll pb-1">
          <div className="app-flow-steps-track">
            <div className="app-flow-steps-row">
              {APP_FLOW_STEPS.map((step, idx) => {
                const isActive = idx === activeStep
                const isCompleted = idx < activeStep
                const isClickable = !isActive

                return (
                  <div key={`step-pill-${step.title}`} className="contents">
                    <div className="app-flow-steps-item">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!isClickable) return
                          const stepNum = (idx + 1) as 1 | 2 | 3
                          if (stepNum === 1) {
                            router.push(step.href)
                            return
                          }
                          const ok = await guardAppFlowStep(stepNum as 2 | 3, router)
                          if (ok) router.push(step.href)
                        }}
                        className={`app-flow-steps-circle ${
                          isClickable ? 'cursor-pointer' : 'cursor-default'
                        } ${
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : isCompleted
                              ? 'bg-primary/10 text-primary'
                              : 'bg-muted text-muted-foreground'
                        }`}
                        aria-current={isActive ? 'step' : undefined}
                      >
                        {step.short}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!isClickable) return
                          const stepNum = (idx + 1) as 1 | 2 | 3
                          if (stepNum === 1) {
                            router.push(step.href)
                            return
                          }
                          const ok = await guardAppFlowStep(stepNum as 2 | 3, router)
                          if (ok) router.push(step.href)
                        }}
                        className={`app-flow-steps-label ${
                          isClickable ? 'cursor-pointer' : 'cursor-default'
                        } ${isActive ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}
                      >
                        {step.title}
                      </button>
                    </div>
                    {idx < APP_FLOW_STEPS.length - 1 && (
                      <div
                        className={`app-flow-steps-connector ${idx < activeStep ? 'bg-primary/55' : 'bg-border'}`}
                        aria-hidden
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
