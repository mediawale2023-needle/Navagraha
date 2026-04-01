// ─── Synastry Engine (Ashta Koota Compatibility) ─────────────────────────────
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct SynastryRequest {
    pub person_a_nakshatra: u8,
    pub person_a_moon_sign: u8,
    pub person_b_nakshatra: u8,
    pub person_b_moon_sign: u8,
    pub person_a_mars_house: Option<u8>,
    pub person_b_mars_house: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
pub struct KootaScore {
    pub name: String,
    pub score: u8,
    pub max_score: u8,
    pub description: String,
    pub is_compatible: bool,
}

#[derive(Debug, Serialize)]
pub struct MangalDoshaResult {
    pub person_a_has_dosha: bool,
    pub person_b_has_dosha: bool,
    pub is_cancelled: bool,
    pub severity: String,
    pub guidance: String,
}

#[derive(Debug, Serialize)]
pub struct SynastryResponse {
    pub koota_scores: Vec<KootaScore>,
    pub total_score: u8,
    pub total_max: u8,
    pub compatibility_grade: String,
    pub compatibility_percentage: u8,
    pub mangal_dosha: MangalDoshaResult,
    pub relationship_windows: Vec<String>,
    pub key_strengths: Vec<String>,
    pub key_challenges: Vec<String>,
}

const NAKSHATRA_GANA: &[u8] = &[
    0,2,0,0,0,2,0,0,2,2,0,0,0,2,0,0,0,2,2,2,0,0,2,0,0,0,0
];
const NAKSHATRA_NADI: &[u8] = &[
    0,1,2,2,1,0,0,1,2,2,1,0,0,1,2,2,1,0,0,1,2,2,1,0,0,1,2
];
const NAKSHATRA_YONI: &[u8] = &[
    0,8,3,11,1,12,4,6,12,2,2,6,5,5,6,6,7,9,12,7,7,3,10,11,13,13,9
];
const NAKSHATRA_VARNA: &[u8] = &[
    3,3,0,0,1,3,0,0,3,0,2,0,2,2,2,0,1,0,0,2,0,1,1,3,0,0,3
];
const MOON_SIGN_LORDS: &[&str] = &[
    "Mars","Venus","Mercury","Moon","Sun","Mercury",
    "Venus","Mars","Jupiter","Saturn","Saturn","Jupiter"
];

fn planets_are_friends(a: &str, b: &str) -> bool {
    let friends: &[(&str, &[&str])] = &[
        ("Sun",&["Moon","Mars","Jupiter"]),
        ("Moon",&["Sun","Mercury"]),
        ("Mars",&["Sun","Moon","Jupiter"]),
        ("Mercury",&["Sun","Venus"]),
        ("Jupiter",&["Sun","Moon","Mars"]),
        ("Venus",&["Mercury","Saturn"]),
        ("Saturn",&["Mercury","Venus"]),
    ];
    friends.iter().any(|(p,f)| *p==a && f.contains(&b))
}

fn nadi_koota(a: u8, b: u8) -> KootaScore {
    let a_n = NAKSHATRA_NADI[(a-1) as usize];
    let b_n = NAKSHATRA_NADI[(b-1) as usize];
    let names = ["Aadi","Madhya","Antya"];
    let score = if a_n == b_n { 0u8 } else { 8 };
    KootaScore {
        name: "Nadi (Genetic Compatibility)".to_string(), score, max_score: 8,
        description: format!("{} vs {} Nadi. {}", names[a_n as usize], names[b_n as usize],
            if score==8 {"Excellent genetic compatibility."} else {"Nadi Dosha — remedies required."}),
        is_compatible: score==8,
    }
}

fn bhakoot_koota(a: u8, b: u8) -> KootaScore {
    let diff = ((b as i8 - a as i8).rem_euclid(12)) as u8 + 1;
    let rev  = ((a as i8 - b as i8).rem_euclid(12)) as u8 + 1;
    let dosha = [(6u8,8u8),(5,9),(3,11)].iter().any(|&(x,y)| (diff==x&&rev==y)||(diff==y&&rev==x));
    let score = if dosha { 0u8 } else { 7 };
    KootaScore {
        name: "Bhakoot (Emotional Health)".to_string(), score, max_score: 7,
        description: format!("Moon house distance {}/{}. {}",diff,rev,
            if score==7 {"Strong emotional harmony."} else {"Bhakoot Dosha — financial/health pressure possible."}),
        is_compatible: score==7,
    }
}

fn gana_koota(a: u8, b: u8) -> KootaScore {
    let ag = NAKSHATRA_GANA[(a-1) as usize];
    let bg = NAKSHATRA_GANA[(b-1) as usize];
    let names = ["Deva","Manava","Rakshasa"];
    let score: u8 = if ag==bg {6} else if (ag==0&&bg==1)||(ag==1&&bg==0) {5} else if ag==1&&bg==2 {1} else {0};
    KootaScore {
        name: "Gana (Temperament)".to_string(), score, max_score: 6,
        description: format!("{} vs {}. Score {}/6.", names[ag as usize], names[bg as usize], score),
        is_compatible: score>=4,
    }
}

fn graha_maitri(a_sign: u8, b_sign: u8) -> KootaScore {
    let al = MOON_SIGN_LORDS[(a_sign-1) as usize];
    let bl = MOON_SIGN_LORDS[(b_sign-1) as usize];
    let score: u8 = if al==bl {5}
        else if planets_are_friends(al,bl)&&planets_are_friends(bl,al) {5}
        else if planets_are_friends(al,bl)||planets_are_friends(bl,al) {4}
        else {2};
    KootaScore {
        name: "Graha Maitri (Mental Bond)".to_string(), score, max_score: 5,
        description: format!("Moon lords {} & {}. Score {}/5.", al, bl, score),
        is_compatible: score>=3,
    }
}

fn varna_koota(a: u8, b: u8) -> KootaScore {
    let av = NAKSHATRA_VARNA[(a-1) as usize];
    let bv = NAKSHATRA_VARNA[(b-1) as usize];
    let score = if bv>=av {1u8} else {0};
    KootaScore {
        name: "Varna (Spiritual)".to_string(), score, max_score: 1,
        description: format!("Varna grades {}/{}", av, bv), is_compatible: score==1,
    }
}

fn yoni_koota(a: u8, b: u8) -> KootaScore {
    let ay = NAKSHATRA_YONI[(a-1) as usize];
    let by = NAKSHATRA_YONI[(b-1) as usize];
    let hostile = [(0u8,5u8),(1,2),(3,8),(4,12),(6,11),(7,9),(10,13)];
    let score: u8 = if ay==by {4}
        else if hostile.iter().any(|&(x,y)| (ay==x&&by==y)||(ay==y&&by==x)) {0}
        else {2};
    KootaScore {
        name: "Yoni (Intimate Compatibility)".to_string(), score, max_score: 4,
        description: format!("Yoni score {}/4.", score), is_compatible: score>=2,
    }
}

fn tara_koota(a: u8, b: u8) -> KootaScore {
    let a_to_b = ((b as i8 - a as i8).rem_euclid(27)) as u8 % 9;
    let b_to_a = ((a as i8 - b as i8).rem_euclid(27)) as u8 % 9;
    let ok = |t: u8| [1u8,3,5,7,0].contains(&t);
    let score: u8 = match (ok(a_to_b), ok(b_to_a)) { (true,true)=>3, (true,false)|(false,true)=>1, _=>0 };
    KootaScore {
        name: "Tara (Dasha Compatibility)".to_string(), score, max_score: 3,
        description: format!("Tara score {}/3.", score), is_compatible: score>=1,
    }
}

fn vashya_koota(a: u8, b: u8) -> KootaScore {
    let grp = |s: u8| -> u8 { match s { 1|2|5|9=>0, 3|6|7|11=>1, 4|8|12=>2, _=>1 } };
    let ag = grp(a); let bg = grp(b);
    let score: u8 = if ag==bg {2} else if ag.abs_diff(bg)==1 {1} else {0};
    KootaScore {
        name: "Vashya (Influence)".to_string(), score, max_score: 2,
        description: format!("Vashya score {}/2.", score), is_compatible: score>=1,
    }
}

fn mangal_dosha_analysis(a: Option<u8>, b: Option<u8>) -> MangalDoshaResult {
    let a_has = matches!(a, Some(1)|Some(4)|Some(7)|Some(8)|Some(12));
    let b_has = matches!(b, Some(1)|Some(4)|Some(7)|Some(8)|Some(12));
    let (sev, guidance) = match (a_has, b_has) {
        (false,false) => ("None","No Mangal Dosha. Mars energy is balanced.".to_string()),
        (true,true)   => ("Cancelled","Both have Mangal Dosha — they cancel each other out.".to_string()),
        _             => ("Present","Mangal Dosha detected in one chart. Kumbh Vivah or remedies advised before marriage.".to_string()),
    };
    MangalDoshaResult { person_a_has_dosha: a_has, person_b_has_dosha: b_has,
        is_cancelled: a_has&&b_has, severity: sev.to_string(), guidance }
}

pub fn calculate_synastry(req: &SynastryRequest) -> SynastryResponse {
    let kootas = vec![
        varna_koota(req.person_a_nakshatra, req.person_b_nakshatra),
        vashya_koota(req.person_a_moon_sign, req.person_b_moon_sign),
        tara_koota(req.person_a_nakshatra, req.person_b_nakshatra),
        yoni_koota(req.person_a_nakshatra, req.person_b_nakshatra),
        graha_maitri(req.person_a_moon_sign, req.person_b_moon_sign),
        gana_koota(req.person_a_nakshatra, req.person_b_nakshatra),
        bhakoot_koota(req.person_a_moon_sign, req.person_b_moon_sign),
        nadi_koota(req.person_a_nakshatra, req.person_b_nakshatra),
    ];
    let total: u8 = kootas.iter().map(|k| k.score).sum();
    let max_total: u8 = kootas.iter().map(|k| k.max_score).sum();
    let grade = match total {
        32..=36=>"Exceptional (32-36/36)",27..=31=>"Excellent (27-31/36)",
        22..=26=>"Good (22-26/36)",18..=21=>"Average (18-21/36)",_=>"Challenging (<18/36)"
    };
    let pct = (total as f32/max_total as f32*100.0) as u8;
    let strengths: Vec<String> = kootas.iter().filter(|k| k.score==k.max_score)
        .map(|k| format!("✅ {} ({}/{})",k.name,k.score,k.max_score)).collect();
    let challenges: Vec<String> = kootas.iter().filter(|k| !k.is_compatible)
        .map(|k| format!("⚠️ {} ({}/{}) — needs attention",k.name,k.score,k.max_score)).collect();
    SynastryResponse {
        koota_scores: kootas, total_score: total, total_max: max_total,
        compatibility_grade: grade.to_string(), compatibility_percentage: pct,
        mangal_dosha: mangal_dosha_analysis(req.person_a_mars_house, req.person_b_mars_house),
        relationship_windows: vec![
            "Jupiter transiting Kendra from both Moon charts = peak marriage timing.".to_string(),
            "Avoid Saturn-Mars transits over 7th house for major decisions.".to_string(),
        ],
        key_strengths: strengths, key_challenges: challenges,
    }
}
