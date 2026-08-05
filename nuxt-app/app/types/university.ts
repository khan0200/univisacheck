export interface ScholarshipTier {
  cert: string
  percent: string
}

export interface University {
  name: string
  koreanName: string
  type: string
  visaDetails: string
  location: string
  address: string
  img: string
  qsRank: string
  founded: string
  programs: string
  badge1: string
  badge2: string
  badge1Class: 'badge-blue' | 'badge-gold' | 'badge-green'
  brandColor: string
  statusTag: string
  is1Percent: boolean
  tuition: string
  appFee: string
  language: string
  visaStatus: string
  kdb1DayAfterAdmission: string
  description: string
  englishTrackMajors: string[]
  koreanTrackMajors: string[]
  /** Present only on universities that also offer a master's track. */
  englishTrackMasters?: string[]
  koreanTrackMasters?: string[]
  /** Legacy flat majors list — kept alongside englishTrackMajors/koreanTrackMajors for entries that only populate this field. */
  majors: string[]
  scholarships: ScholarshipTier[]
  bachelorScholarships?: ScholarshipTier[]
  masterScholarships?: ScholarshipTier[]
  otherGrantsNote: string
}
