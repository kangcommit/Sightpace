import type { InitialTrip } from '../editor/trip-editor-utils'

const tripId = '00000000-0000-4000-8000-000000000001'
const dayId = '00000000-0000-4000-8000-000000000002'
const activityIds = [
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000012',
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000014',
  '00000000-0000-4000-8000-000000000015',
  '00000000-0000-4000-8000-000000000016',
]

export function sampleTrip(date: string): InitialTrip {
  return {
    id: tripId,
    title: 'A day in Bandung',
    destination: 'Bandung, Indonesia',
    revision: 1,
    days: [
      {
        id: dayId,
        date,
        startMinute: 540,
        finishMinute: 1080,
        activities: [
          {
            id: activityIds[0],
            title: 'Breakfast',
            placeLabel: 'Warung Kopi Purnama',
            durationMinutes: 45,
            fixedStartMinute: null,
          },
          {
            id: activityIds[1],
            title: 'Visit the Geological Museum',
            placeLabel: 'Geological Museum, Bandung',
            durationMinutes: 90,
            fixedStartMinute: null,
          },
          {
            id: activityIds[2],
            title: 'Lunch',
            placeLabel: 'Braga Permai Restaurant',
            durationMinutes: 45,
            fixedStartMinute: 720,
          },
          {
            id: activityIds[3],
            title: 'Walk along Braga Street',
            placeLabel: 'Braga Street',
            durationMinutes: 50,
            fixedStartMinute: null,
          },
          {
            id: activityIds[4],
            title: 'Visit the Asian-African Conference Museum',
            placeLabel: 'Asia-Africa Street',
            durationMinutes: 75,
            fixedStartMinute: null,
          },
          {
            id: activityIds[5],
            title: 'Shop at Pasar Baru Trade Center',
            placeLabel: 'Otto Iskandar Dinata Street, Bandung',
            durationMinutes: 40,
            fixedStartMinute: null,
          },
        ],
        travelEstimates: [
          { fromActivityId: activityIds[0], toActivityId: activityIds[1], minutes: 20 },
          { fromActivityId: activityIds[1], toActivityId: activityIds[2], minutes: 30 },
          { fromActivityId: activityIds[3], toActivityId: activityIds[4], minutes: 15 },
          { fromActivityId: activityIds[4], toActivityId: activityIds[5], minutes: 20 },
        ],
      },
    ],
  }
}
