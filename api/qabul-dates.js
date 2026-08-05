// API Handler for Admission Dates (UwayApply & JinhakApply aggregated dataset)
const ADMISSION_DATES = [
    {
        id: "korea-univ-2027",
        university_uz: "Koreya Universiteti (Korea University)",
        university_en: "Korea University",
        university_kr: "고려대학교 외국인",
        category_uz: "Xalqaro Talabalar (Bakalavr / Magistr)",
        category_en: "INT'L Students (Spring 2027)",
        program_type: "undergraduate_graduate",
        application_start: "2026-08-03",
        application_end: "2026-08-31",
        documents_deadline: "2026-09-07",
        result_date: "2026-11-27",
        registration_period: "2027-01",
        region: "Seoul",
        establishment: "Xususiy (Private)",
        status: "Accepting",
        platform: "Uway Apply",
        url: "https://ipsi1.uwayapply.com/2027/foreign/korea_oia/?CHA=1&UM",
        official_notice_url: "https://oia.korea.ac.kr",
        details_uz: "Onlayn ariza: 3-avgust (10:00) – 31-avgust (17:00). Hujjatlar yetib borish oxirgi kuni: 7-sentabr. Natijalar e'loni: 27-noyabr.",
        is_hot: true
    },
    {
        id: "seoultech-conditional-2026",
        university_uz: "Seul Milliy Fan va Texnologiyalar Universiteti (SeoulTech) — Shartli Qabul",
        university_en: "SeoulTech - Conditional Admission",
        university_kr: "서울과학기술대학교 (Conditional)",
        category_uz: "Til kursi / Shartli Qabul",
        category_en: "INT'L Students (Conditional)",
        program_type: "language",
        application_start: "2026-07-01",
        application_end: "2026-11-30",
        region: "Seoul",
        establishment: "Davlat (National & Public)",
        status: "Accepting",
        platform: "Uway Apply",
        url: "https://ipsi1.uwayapply.com/2027/foreign/korea_oia/?CHA=1&UM",
        official_notice_url: "https://www.seoultech.ac.kr",
        details_uz: "Til sertifikatisiz bakalavrga shartli ravishda kirish va tayyorlov bosqichida o'qish imkoniyati.",
        is_hot: true
    },
    {
        id: "seoultech-stem-2026",
        university_uz: "SeoulTech — STEM Yetakchilar Dasturi",
        university_en: "SeoulTech - STEM Leader Program",
        university_kr: "서울과학기술대학교 (STEM Leader)",
        category_uz: "STEM / Muhandislik",
        category_en: "INT'L Students STEM Leader",
        program_type: "undergraduate",
        application_start: "2026-07-01",
        application_end: "2026-11-30",
        region: "Seoul",
        establishment: "Davlat (National & Public)",
        status: "Accepting",
        platform: "Uway Apply",
        url: "https://ipsi1.uwayapply.com/2027/foreign/korea_oia/?CHA=1&UM",
        details_uz: "Texnologiya, axborot tizimlari va muhandislik yo'nalishlarida xalqaro talabalar uchun maxsus grant dasturi.",
        is_hot: false
    },
    {
        id: "yonsei-future-2026",
        university_uz: "Yonsei Universiteti (Future Kampus)",
        university_en: "Yonsei University (Future)",
        university_kr: "연세대학교(미래)",
        category_uz: "Xalqaro Talabalar",
        category_en: "INT'L Students",
        program_type: "undergraduate",
        application_start: "2026-07-27",
        application_end: "2026-08-14",
        region: "Gangwon",
        establishment: "Xususiy (Private)",
        status: "Accepting",
        platform: "Uway Apply",
        url: "https://ipsi1.uwayapply.com/2027/foreign/korea_oia/?CHA=1&UM",
        details_uz: "Yonsei Future kampusiga kuzgi/bahorgi qabul topshirig'i UwayApply orqali amalga oshiriladi.",
        is_hot: true
    },
    {
        id: "konkuk-glocal-2026",
        university_uz: "Konkuk Universiteti (GLOCAL) — 3-bosqich Qabul",
        university_en: "Konkuk University (GLOCAL)",
        university_kr: "건국대학교(GLOCAL) 3차모집",
        category_uz: "Xalqaro Talabalar (Bakalavr)",
        category_en: "Int'l Students (3rd Round)",
        program_type: "undergraduate",
        application_start: "2026-07-29",
        application_end: "2026-08-18",
        interview_date: "2026-08-20",
        result_date: "2026-08-25",
        registration_period: "2026-08-26",
        region: "Chungbuk",
        establishment: "Xususiy (Private)",
        status: "Accepting",
        platform: "Jinhak Apply",
        url: "https://enter.jinhakapply.com/Notice/1009133/A",
        official_notice_url: "https://enter.jinhakapply.com",
        details_uz: "Suhbat: 20-avgust. Natijalar e'loni: 25-avgust. Shartnoma to'lovi: 26-avgust. JinhakApply orqali.",
        is_hot: true
    },
    {
        id: "dongseo-univ-2026",
        university_uz: "Dongseo Universiteti — Qo'shimcha 2-qabul",
        university_en: "Dongseo University",
        university_kr: "동서대학교 (후기추가2차)",
        category_uz: "Xalqaro Talabalar / Ko'chirish",
        category_en: "Int'l Students & Transfers",
        program_type: "undergraduate",
        application_start: "2026-07-28",
        application_end: "2026-08-15",
        region: "Busan",
        establishment: "Xususiy (Private)",
        status: "Accepting",
        platform: "Jinhak Apply",
        url: "https://enter.jinhakapply.com/",
        details_uz: "Busan shahridagi Dongseo universitetiga yangi hamda o'qishini ko'chirmoqchi bo'lgan xalqaro talabalar qabuli.",
        is_hot: false
    },
    {
        id: "intl-univ-arts-2026",
        university_uz: "Xalqaro San'at Universiteti (International Univ of Arts)",
        university_en: "International University of the Arts",
        university_kr: "국제예술대학교",
        category_uz: "Kollej / O'qishni ko'chirish",
        category_en: "Transfer to Junior College",
        program_type: "transfer",
        application_start: "2026-07-22",
        application_end: "2026-08-05",
        region: "Seoul",
        establishment: "Xususiy (Private)",
        status: "Accepting",
        platform: "Uway Apply",
        url: "https://wwwsub.uwayapply.com/",
        details_uz: "San'at, musiqa va dizayn yo'nalishlarida o'qishni ko'chirish hamda 2 yillik professional dasturlar.",
        is_hot: false
    },
    {
        id: "unist-novatus-2026",
        university_uz: "UNIST Novatus Magistratura (Elektrotexnika)",
        university_en: "UNIST Novatus Graduate School",
        university_kr: "UNIST Novatus 대학원",
        category_uz: "Magistratura / PhD",
        category_en: "Graduate School (Electrical Eng.)",
        program_type: "graduate",
        application_start: "2026-06-29",
        application_end: "2026-08-19",
        region: "Ulsan",
        establishment: "Davlat (National & Public)",
        status: "Accepting",
        platform: "Uway Apply",
        url: "https://wwwsub.uwayapply.com/",
        details_uz: "UNIST oliygohining Elektrotexnika bo'yicha yuqori texnologik ilmiy-tadqiqot magistratura dasturi.",
        is_hot: true
    },
    {
        id: "catholic-kwandong-2026",
        university_uz: "Kvandong Katolik Universiteti Magistraturasi",
        university_en: "Catholic Kwandong University Graduate School",
        university_kr: "가톨릭관동대학교 대학원",
        category_uz: "Magistratura / PhD",
        category_en: "Graduate School (Outside of Quota)",
        program_type: "graduate",
        application_start: "2026-07-07",
        application_end: "2026-08-06",
        region: "Gangwon",
        establishment: "Xususiy (Private)",
        status: "Accepting",
        platform: "Uway Apply",
        url: "https://wwwsub.uwayapply.com/",
        details_uz: "Xorijiy talabalar uchun maxsus kvotadan tashqari magistratura va doktorantura qabuli.",
        is_hot: false
    },
    {
        id: "jeju-business-2026",
        university_uz: "Jeju Milliy Universiteti — Biznes Magistraturasi",
        university_en: "Jeju National University Graduate School of Business",
        university_kr: "제주대학교 경영대학원",
        category_uz: "Magistratura (Biznes)",
        category_en: "Graduate School of Business",
        program_type: "graduate",
        application_start: "2026-07-30",
        application_end: "2026-08-05",
        region: "Jeju",
        establishment: "Davlat (National & Public)",
        status: "Accepting",
        platform: "Uway Apply",
        url: "https://wwwsub.uwayapply.com/",
        details_uz: "MBA va biznes boshqaruvi yo'nalishida magistr darajasiga qabul.",
        is_hot: false
    },
    {
        id: "sungkyunkwan-grad-2026",
        university_uz: "Sungkyunkwan Universiteti (SKKU) Magistraturasi",
        university_en: "Sungkyunkwan University Graduate School",
        university_kr: "성균관대학교 대학원",
        category_uz: "Magistratura / PhD",
        category_en: "Graduate School (Law & General)",
        program_type: "graduate",
        application_start: "2026-07-25",
        application_end: "2026-08-12",
        region: "Seoul / Suwon",
        establishment: "Xususiy (Private)",
        status: "Accepting",
        platform: "Jinhak Apply",
        url: "https://enter.jinhakapply.com/",
        details_uz: "Huquq va umumiy mutaxassisliklar bo'yicha magistratura va doktorantura bosqichlariga qabul.",
        is_hot: true
    },
    {
        id: "dongguk-seoul-grad-2026",
        university_uz: "Dongguk Universiteti (Seul) Magistraturasi",
        university_en: "Dongguk University (Seoul)",
        university_kr: "동국대학교(서울) 대학원",
        category_uz: "Magistratura (Ta'lim xizmatlari)",
        category_en: "Graduate School of Education Services",
        program_type: "graduate",
        application_start: "2026-07-28",
        application_end: "2026-08-11",
        region: "Seoul",
        establishment: "Xususiy (Private)",
        status: "Accepting",
        platform: "Jinhak Apply",
        url: "https://enter.jinhakapply.com/",
        details_uz: "Seul markazidagi Dongguk universitetiga 2-bosqich magistratura qabuli.",
        is_hot: false
    },
    {
        id: "pusan-national-grad-2026",
        university_uz: "Pusan Milliy Universiteti (Stomatologiya / Tibbiyot)",
        university_en: "Pusan National University Graduate School",
        university_kr: "부산대학교 치의학/한의학전문대학원",
        category_uz: "Tibbiyot / Magistratura",
        category_en: "Graduate School of Dentistry & Medicine",
        program_type: "graduate",
        application_start: "2026-07-25",
        application_end: "2026-08-10",
        region: "Busan",
        establishment: "Davlat (National & Public)",
        status: "Accepting",
        platform: "Jinhak Apply",
        url: "https://enter.jinhakapply.com/",
        details_uz: "Stomatologiya va an'anaviy sharq tibbiyoti bo'yicha oliy magistratura maktabi.",
        is_hot: true
    },
    {
        id: "kwangwoon-grad-2026",
        university_uz: "Kwangwoon Universiteti Magistraturasi",
        university_en: "Kwangwoon University Graduate School",
        university_kr: "광운대학교 대학원",
        category_uz: "Magistratura",
        category_en: "Graduate School Reviews",
        program_type: "graduate",
        application_start: "2026-07-27",
        application_end: "2026-08-04",
        region: "Seoul",
        establishment: "Xususiy (Private)",
        status: "Deadline",
        platform: "Uway Apply",
        url: "https://wwwsub.uwayapply.com/",
        details_uz: "Qabul 4-avgustda yopildi. Natijalar ko'rib chiqish bosqichida.",
        is_hot: false
    },
    {
        id: "chungang-nursing-2026",
        university_uz: "Chung-Ang Universiteti Hamshiralik Oliy Maktabi",
        university_en: "Chung-Ang University Graduate School of Health Nursing",
        university_kr: "중앙대학교 간호대학원",
        category_uz: "Magistratura (Hamshiralik / Sog'liqni Saqlash)",
        category_en: "Graduate School of Nursing",
        program_type: "graduate",
        application_start: "2026-07-29",
        application_end: "2026-08-04",
        region: "Seoul",
        establishment: "Xususiy (Private)",
        status: "Deadline",
        platform: "Uway Apply",
        url: "https://wwwsub.uwayapply.com/",
        details_uz: "Qabul 4-avgust kuni yopildi.",
        is_hot: false
    },
    {
        id: "handong-law-2026",
        university_uz: "Handong Xalqaro Huquq Maktabi (HILS)",
        university_en: "Handong International Law School",
        university_kr: "한동대학교 국제법률대학원",
        category_uz: "Magistratura / Huquq",
        category_en: "International Law School",
        program_type: "graduate",
        application_start: "2026-08-15",
        application_end: "2026-09-15",
        region: "Pohang",
        establishment: "Xususiy (Private)",
        status: "Scheduled",
        platform: "Jinhak Apply",
        url: "https://enter.jinhakapply.com/",
        details_uz: "AQSH va xalqaro huquq bo'yicha magistratura va J.D. ekvivalent qabuli tez orada boshlanadi.",
        is_hot: false
    }
];

module.exports = async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const urlParams = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams;
        const search = (urlParams.get('search') || '').toLowerCase();
        const status = urlParams.get('status');
        const platform = urlParams.get('platform');
        const program = urlParams.get('program');

        let filtered = ADMISSION_DATES;

        if (search) {
            filtered = filtered.filter(item => 
                item.university_uz.toLowerCase().includes(search) ||
                item.university_en.toLowerCase().includes(search) ||
                item.university_kr.toLowerCase().includes(search) ||
                item.category_uz.toLowerCase().includes(search) ||
                item.region.toLowerCase().includes(search)
            );
        }

        if (status && status !== 'all') {
            filtered = filtered.filter(item => item.status.toLowerCase() === status.toLowerCase());
        }

        if (platform && platform !== 'all') {
            filtered = filtered.filter(item => item.platform.toLowerCase().includes(platform.toLowerCase()));
        }

        if (program && program !== 'all') {
            filtered = filtered.filter(item => item.program_type.includes(program));
        }

        // Stats summary
        const total = ADMISSION_DATES.length;
        const accepting = ADMISSION_DATES.filter(i => i.status === 'Accepting').length;
        const deadline = ADMISSION_DATES.filter(i => i.status === 'Deadline').length;
        const scheduled = ADMISSION_DATES.filter(i => i.status === 'Scheduled').length;

        res.status(200).json({
            success: true,
            total,
            stats: {
                accepting,
                deadline,
                scheduled,
                uway_count: ADMISSION_DATES.filter(i => i.platform === 'Uway Apply').length,
                jinhak_count: ADMISSION_DATES.filter(i => i.platform === 'Jinhak Apply').length
            },
            data: filtered,
            updatedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error('[Qabul API Error]:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
