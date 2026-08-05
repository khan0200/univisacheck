export const ADMISSION_DOCS = [
  "Talaba pasporti – ID",
  "Xorijiy pasport (Zagran)",
  "Ota-onaning pasporti",
  "Nikoh guvohnomasi",
  "Til sertifikati",
  "Tug'ilganlik guvohnomasi",
  'Fotosurat (3.5×4.5)',
  'Diplom / Attestat',
  "3 yillik baho ma'lumotnomasi",
  'GPA SCALING ma\'lumotnomasi'
]

const STUDENT_DOCS_COMMON = [
  'Zagran pasport (Asli va nusxasi)',
  'Bio pasport yoki ID kartasi',
  'Admission (Taklifnoma)',
  'Business Registration'
]

export const EMBASSY_1PERCENT = {
  student: [
    ...STUDENT_DOCS_COMMON,
    'Bitiruv hujjati (Diplom/Shahodatnoma)',
    'Til bilish sertifikati',
    "Tug'ilganlik guvohnomasi (Metrka)",
    "Ota-ona nikoh guvohnomasi (ZAGS)",
    "Nikoh holati haqida ma'lumotnoma",
    'Fotosurat (3.5×4.5 sm)',
    "Study Plan (O'quv rejasi)"
  ],
  parent: ['Ota-Ona bio pasport/ID nusxasi']
}

export const EMBASSY_STANDARD = {
  student: [
    ...STUDENT_DOCS_COMMON,
    'Bitiruv hujjati (Diplom/Shahodatnoma)',
    'KDB bank hisobi (muzlatilgan)',
    'Til bilish sertifikati',
    "Tug'ilganlik guvohnomasi (Metrka)",
    "Ota-ona nikoh guvohnomasi (ZAGS)",
    "Nikoh holati haqida ma'lumotnoma",
    'Fotosurat (3.5×4.5 sm)',
    "Study Plan (O'quv rejasi)"
  ],
  parent: [
    'Ota-Ona bio pasport/ID nusxasi',
    "Mehnat daftarchasidan ko'chirma",
    "Yillik daromad ma'lumotnomasi",
    'Mulk va Transport hujjatlari',
    "Bank balansidan ko'chirma (1 kunlik)"
  ]
}
