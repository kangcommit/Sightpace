import type { Metadata } from 'next'
import { sampleTrip } from '@/features/trips/sample/sample-data'
import { SamplePlanner } from '@/features/trips/sample/sample-planner'
import { todayDate } from '@/features/trips/shared/date-rules'
import { requireUser } from '@/lib/session'

export const metadata: Metadata = { title: 'Try the sample | TrailPlan' }
export const dynamic = 'force-dynamic'

export default async function DemoPage() {
  const user = await requireUser().catch(() => null)

  return <SamplePlanner trip={sampleTrip(todayDate())} authenticated={Boolean(user?.ok)} />
}
