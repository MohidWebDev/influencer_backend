// Campaign ki halat
// draft  -> business ne banayi, abhi public nahi (unverified business sirf draft rakh sakta hai)
// open   -> public: talents apply kar sakte hain
// closed -> business ne band kar di, ya jitne talent chahiye the utne select ho gaye
export const CAMPAIGN_STATUSES = ['draft', 'open', 'closed'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

// Talent ki application ki halat
// pending   -> business ka jawab baqi
// accepted  -> business ne select kiya (hire request "accepted" ban jati hai, muahida wahan se)
// rejected  -> business ne mana kar diya
// withdrawn -> talent ne jawab se pehle wapas le li
export const APPLICATION_STATUSES = ['pending', 'accepted', 'rejected', 'withdrawn'] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const MAX_CAMPAIGN_SLOTS = 100
