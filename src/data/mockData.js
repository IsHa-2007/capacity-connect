// Central mock data layer for CAPACITY CONNECT

export const DOMAINS = [
  'Radar Operations',
  'Numerical Weather Prediction (NWP)',
  'Satellite Meteorology',
  'Climate Science',
  'Hydrology',
  'Disaster Management',
]

// Domain expertise choices for professional profiles (single-select), plus the
// dependent specializations offered for each expertise area (multi-select).
export const EXPERTISE_OPTIONS = [
  'Meteorology',
  'Climate Science',
  'Disaster Management',
  'Hydrology',
  'Environmental Science',
  'Agriculture',
  'Data Science',
  'AI',
  'Remote Sensing',
  'GIS',
  'Cybersecurity',
  'IT',
  'Other',
]

export const SPECIALIZATION_MAP = {
  Meteorology: ['Weather Forecasting', 'Severe Weather Warnings', 'Doppler Radar', 'NWP Modeling', 'Mesoscale Meteorology', 'Aviation Meteorology', 'Marine Meteorology'],
  'Climate Science': ['Climate Projection', 'Climate Risk Assessment', 'Paleoclimatology', 'Monsoon Dynamics', 'Climate Policy'],
  'Disaster Management': ['Early Warning Systems', 'Disaster Risk Reduction', 'Emergency Response', 'Recovery Planning'],
  Hydrology: ['Hydrological Modeling', 'Flood Forecasting', 'Groundwater Assessment', 'Reservoir Operations', 'Water Resource Management'],
  'Environmental Science': ['Air Quality', 'Environmental Impact Assessment', 'Atmospheric Chemistry', 'Ecology'],
  Agriculture: ['Agrometeorology', 'Crop Modelling', 'Agricultural Advisory', 'Drought Monitoring'],
  'Data Science': ['Statistical Modeling', 'Machine Learning', 'Big Data Analytics', 'Data Visualization'],
  AI: ['Machine Learning', 'Deep Learning', 'Computer Vision', 'NLP'],
  'Remote Sensing': ['Satellite Image Analysis', 'Radar Remote Sensing', 'Optical Remote Sensing'],
  GIS: ['Spatial Analysis', 'Cartography', 'Geodatabase Management'],
  Cybersecurity: ['Network Security', 'Threat Analysis', 'Security Operations'],
  IT: ['Software Engineering', 'Cloud Computing', 'Database Administration', 'System Administration'],
  Other: [],
}

export const DIFFICULTY = ['Beginner', 'Intermediate', 'Advanced']

export const STATIONS = [
  'New Delhi',
  'Mumbai',
  'Kolkata',
  'Chennai',
  'Bengaluru',
  'Hyderabad',
  'Pune',
  'Ahmedabad',
  'Guwahati',
  'Jaipur',
  'Thiruvananthapuram',
  'Bhubaneswar',
]

export const STEPS = [
  { id: 'notes', label: 'Study Notes', icon: 'BookOpen' },
  { id: 'slides', label: 'Slide Decks', icon: 'Presentation' },
  { id: 'video', label: 'Video Lectures', icon: 'PlayCircle' },
  { id: 'practice', label: 'Practice Sets', icon: 'ClipboardCheck' },
  { id: 'assessment', label: 'Assessment', icon: 'FileCheck' },
  { id: 'feedback', label: 'Feedback', icon: 'MessageSquare' },
  { id: 'certificate', label: 'Certificate', icon: 'Award' },
]

// ------------------- USERS -------------------
export const users = [
  {
    id: 'u1',
    name: 'Aarav Sharma',
    email: 'trainee@capacity.gov.in',
    password: 'password',
    role: 'TRAINEE',
    status: 'approved',
    department: 'Forecasting Division',
    empId: 'IMD-FC-3321',
    station: 'New Delhi',
    title: 'Meteorologist Grade-II',
    professionalSummary: 'Operational meteorologist with a focus on short-range forecasting for the northern region. Interested in applying NWP guidance and satellite products to improve day-to-day forecasts.',
    yearsOfExperience: '6 years',
    expertise: ['Meteorology', 'Satellite Meteorology'],
    specializations: ['Doppler Radar Interpretation', 'NWP Output Interpretation'],
    skills: ['Forecasting', 'Satellite Imagery Analysis', 'Station Observation', 'THUNDER & Duststorm Outlook'],
    qualifications: ['M.Sc. Atmospheric Science (SPPU)', 'B.Sc. Physics (DU)'],
    trainingInterests: ['Satellite Meteorology', 'NWP', 'Nowcasting'],
    achievements: ['Certified Doppler Weather Radar Analyst', 'IMD Best Forecaster (Regional)' ],
  },
  {
    id: 'u2',
    name: 'Dr. Priya Menon',
    email: 'trainer@capacity.gov.in',
    password: 'password',
    role: 'TRAINER',
    status: 'approved',
    department: 'Training Directorate',
    empId: 'IMD-TR-1107',
    station: 'Pune',
    title: 'Principal Scientist',
    experience: '18 years',
    expertise: ['NWP', 'Climate Science', 'Satellite Meteorology'],
    specializations: ['Ensemble Forecasting', 'Global Modelling'],
    skills: ['NWP Modelling', 'Training Design', 'Climate Indices'],
    qualifications: ['Ph.D. Atmospheric Sciences (IISc)', 'M.Tech Atmospheric Science'],
    professionalSummary: 'Principal scientist and lead trainer at IMD Pune with deep expertise in numerical weather prediction and satellite meteorology, having authored multiple operational training programs.',
    trainingInterests: ['NWP', 'Satellite Meteorology', 'Climate Variability'],
    achievements: ['IMD Meritorious Service Award', 'Lead Trainer, WMO Regional Training Centre'],
  },
  {
    id: 'u3',
    name: 'Rajesh Verma',
    email: 'admin@capacity.gov.in',
    password: 'admin',
    role: 'ADMIN',
    status: 'approved',
    department: 'IMD Headquarters',
    empId: 'IMD-HQ-0001',
    station: 'New Delhi',
    title: 'Director, Capacity Building',
  },
  {
    id: 'u4',
    name: 'Kavita Joshi',
    email: 'pending@capacity.gov.in',
    password: 'password',
    role: 'TRAINEE',
    status: 'pending',
    department: 'Regional Centre',
    empId: 'IMD-RC-8854',
    station: 'Guwahati',
    title: 'Observer',
  },
]

// ------------------- TRAINERS -------------------
export const trainers = [
  {
    id: 'tr1',
    name: 'Dr. Priya Menon',
    userId: 'u2',
    expertise: ['NWP', 'Climate Science', 'Satellite Meteorology'],
    rating: 4.7,
    feedbackScore: 4.6,
    availability: true,
    history: 3,
    station: 'Pune',
    experience: '18 years',
  },
  {
    id: 'tr2',
    name: 'Dr. Arjun Nair',
    expertise: ['Radar Operations', 'Hydrology'],
    rating: 4.4,
    feedbackScore: 4.3,
    availability: true,
    history: 2,
    station: 'Chennai',
    experience: '12 years',
  },
  {
    id: 'tr3',
    name: 'Dr. Suman Bhattacharya',
    expertise: ['Disaster Management', 'Hydrology', 'Satellite Meteorology'],
    rating: 4.9,
    feedbackScore: 4.8,
    availability: false,
    history: 5,
    station: 'Kolkata',
    experience: '22 years',
  },
  {
    id: 'tr4',
    name: 'Dr. Vikram Rao',
    expertise: ['NWP', 'Radar Operations'],
    rating: 4.2,
    feedbackScore: 4.1,
    availability: true,
    history: 1,
    station: 'Hyderabad',
    experience: '9 years',
  },
]

// ------------------- COURSE QUESTION BANKS -------------------
const makeBank = (title) => {
  const top = (text) => ({ id: `${title}-t-${Math.random().toString(36).slice(2, 7)}`, text })
  return [
    // EASY (5)
    { difficulty: 'easy', topic: title, text: `${title}: Basic concept question 1`, options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 0, tag: top('Foundational') },
    { difficulty: 'easy', topic: title, text: `${title}: Which of the following describes the primary purpose of systematic observation?`, options: ['Data collection for analysis', 'Recreation', 'Administration', 'Reporting only'], answer: 0, tag: top('Foundational') },
    { difficulty: 'easy', topic: title, text: `${title}: Basic concept question 2`, options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 1, tag: top('Foundational') },
    { difficulty: 'easy', topic: title, text: `${title}: The standard unit commonly used is?`, options: ['Metre', 'Kilogram', 'Degree', 'All of the above'], answer: 3, tag: top('Foundational') },
    { difficulty: 'easy', topic: title, text: `${title}: Basic concept question 3`, options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 2, tag: top('Foundational') },
    // MEDIUM (5)
    { difficulty: 'medium', topic: title, text: `${title}: Intermediate interpretation question 1`, options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 0, tag: top('Interpretation') },
    { difficulty: 'medium', topic: title, text: `${title}: How does spatial resolution affect the reliability of observations?`, options: ['It has no effect', 'Higher resolution improves detail', 'Lower resolution is always better', 'Resolution only affects speed'], answer: 1, tag: top('Interpretation') },
    { difficulty: 'medium', topic: title, text: `${title}: Intermediate interpretation question 2`, options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 2, tag: top('Interpretation') },
    { difficulty: 'medium', topic: title, text: `${title}: Which factor most influences the accuracy of an analytical model?`, options: ['Input data quality', 'Output formatting', 'Chart style', 'Report length'], answer: 0, tag: top('Interpretation') },
    { difficulty: 'medium', topic: title, text: `${title}: Intermediate interpretation question 3`, options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 3, tag: top('Interpretation') },
    // HARD (5)
    { difficulty: 'hard', topic: title, text: `${title}: Advanced analytical scenario — evaluate the trade-offs and select the most operationally sound decision.`, options: ['Decision 1', 'Decision 2', 'Decision 3', 'Decision 4'], answer: 1, tag: top('Operational') },
    { difficulty: 'hard', topic: title, text: `${title}: Given non-linear error propagation, which mitigation strategy is most robust for operational deployment?`, options: ['Strategy A', 'Strategy B', 'Strategy C', 'Strategy D'], answer: 2, tag: top('Operational') },
    { difficulty: 'hard', topic: title, text: `${title}: Advanced analytical scenario 2`, options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 0, tag: top('Operational') },
    { difficulty: 'hard', topic: title, text: `${title}: Critically assess the coupling of multiple sub-systems; which configuration yields optimal skill?`, options: ['Config 1', 'Config 2', 'Config 3', 'Config 4'], answer: 3, tag: top('Operational') },
    { difficulty: 'hard', topic: title, text: `${title}: Advanced analytical scenario 3`, options: ['Option A', 'Option B', 'Option C', 'Option D'], answer: 1, tag: top('Operational') },
  ]
}

// ------------------- COURSES -------------------
export const courses = [
  {
    id: 'c1',
    title: 'Weather Forecasting Fundamentals',
    domain: 'NWP',
    description: 'Foundations of numerical weather prediction, model interpretation, and operational forecasting workflows used across IMD forecast offices.',
    difficulty: 'Beginner',
    duration: '4 weeks',
    trainerId: 'tr1',
    trainer: 'Dr. Priya Menon',
    objectives: ['Understand atmospheric data assimilation', 'Interpret model output', 'Apply forecasting decision frameworks'],
    syllabus: ['Introduction to Forecast Chains', 'Data Assimilation Basics', 'Model Output Interpretation', 'Probabilistic Forecasting'],
    tags: ['NWP', 'Forecasting'],
    status: 'published',
    enrolled: 124,
    completion: 72,
    rating: 4.7,
    bank: makeBank('Weather Forecasting Fundamentals'),
  },
  {
    id: 'c2',
    title: 'Radar Operations & Interpretation',
    domain: 'Radar Operations',
    description: 'Hands-on radar fundamentals, reflectivity and velocity interpretation, and quality-controlled operational radar analysis.',
    difficulty: 'Intermediate',
    duration: '3 weeks',
    trainerId: 'tr2',
    trainer: 'Dr. Arjun Nair',
    objectives: ['Operate radar systems', 'Interpret reflectivity signatures', 'Conduct quality control'],
    syllabus: ['Radar Principles', 'Reflectivity Analysis', 'Velocity Interpretation', 'Polarimetric Products'],
    tags: ['Radar', 'Doppler'],
    status: 'published',
    enrolled: 98,
    completion: 61,
    rating: 4.4,
    bank: makeBank('Radar Operations & Interpretation'),
  },
  {
    id: 'c3',
    title: 'Data Visualization with Python',
    domain: 'Climate Science',
    description: 'Build reproducible scientific visualizations with Python for climate and atmospheric data products.',
    difficulty: 'Advanced',
    duration: '5 weeks',
    trainerId: 'tr1',
    trainer: 'Dr. Priya Menon',
    objectives: ['Write analysis scripts', 'Design publication-grade figures', 'Communicate findings clearly'],
    syllabus: ['Python for Meteorology', 'NetCDF Handling', 'Map Projections', 'Publication Figures'],
    tags: ['Python', 'Data Science'],
    status: 'published',
    enrolled: 156,
    completion: 78,
    rating: 4.8,
    bank: makeBank('Data Visualization with Python'),
  },
  {
    id: 'c4',
    title: 'Disaster Risk Management',
    domain: 'Disaster Management',
    description: 'Integrating meteorological early warnings into disaster risk reduction and emergency response planning.',
    difficulty: 'Beginner',
    duration: '2 weeks',
    trainerId: 'tr3',
    trainer: 'Dr. Suman Bhattacharya',
    objectives: ['Map hazard chains', 'Design early warning workflows', 'Coordinate response agencies'],
    syllabus: ['Hazard Assessment', 'Early Warning Systems', 'Inter-Agency Coordination', 'Community Preparedness'],
    tags: ['DRR', 'Early Warning'],
    status: 'published',
    enrolled: 210,
    completion: 55,
    rating: 4.9,
    bank: makeBank('Disaster Risk Management'),
  },
  {
    id: 'c5',
    title: 'Advanced Hydrological Modeling',
    domain: 'Hydrology',
    description: 'Newly available advanced course covering distributed hydrological models and flood forecasting integration.',
    difficulty: 'Advanced',
    duration: '6 weeks',
    trainerId: 'tr3',
    trainer: 'Dr. Suman Bhattacharya',
    objectives: ['Configure hydrological models', 'Couple with NWP rainfall', 'Issue flood forecasts'],
    syllabus: ['Basin Modeling', 'Rainfall-Runoff', 'Flood Forecasting', 'Model Calibration'],
    tags: ['Hydrology', 'Flood'],
    status: 'featured',
    enrolled: 45,
    completion: 12,
    rating: 4.6,
    bank: makeBank('Advanced Hydrological Modeling'),
  },
  {
    id: 'c6',
    title: 'Satellite Meteorology Applications',
    domain: 'Satellite Meteorology',
    description: 'Interpreting multi-spectral satellite imagery for severe weather monitoring across the Indian region.',
    difficulty: 'Intermediate',
    duration: '3 weeks',
    trainerId: 'tr1',
    trainer: 'Dr. Priya Menon',
    objectives: ['Identify cloud types', 'Track cyclones via imagery', 'Use RGB composites'],
    syllabus: ['Satellite Systems', 'Spectral Bands', 'RGB Composites', 'Cyclone Tracking'],
    tags: ['Satellite', 'INSAT'],
    status: 'published',
    enrolled: 87,
    completion: 40,
    rating: 4.5,
    bank: makeBank('Satellite Meteorology Applications'),
  },
]

// ------------------- SEED ENROLLMENTS (for the logged-in trainee) -------------------
export const seedEnrollments = [
  {
    traineeId: 'u1',
    trainerId: 'tr1',
    courseId: 'c1',
    status: 'inprogress',
    progress: 60,
    stage: 'video',
    startedOn: '2026-07-12',
    // completed sections tracked by stage
    notesDone: true,
    slidesDone: true,
    videoDone: false,
    practiceDone: false,
    assessment: null, // { score, passed, attemptedAt }
    feedback: null,
    certificate: null,
  },
  {
    traineeId: 'u1',
    trainerId: 'tr1',
    courseId: 'c3',
    status: 'inprogress',
    progress: 75,
    stage: 'assessment',
    startedOn: '2026-06-20',
    notesDone: true,
    slidesDone: true,
    videoDone: true,
    practiceDone: true,
    assessment: null,
    feedback: null,
    certificate: null,
  },
  {
    traineeId: 'u1',
    trainerId: 'tr2',
    courseId: 'c2',
    status: 'inprogress',
    progress: 40,
    stage: 'slides',
    startedOn: '2026-08-02',
    notesDone: true,
    slidesDone: false,
    videoDone: false,
    practiceDone: false,
    assessment: null,
    feedback: null,
    certificate: null,
  },
  {
    traineeId: 'u1',
    trainerId: 'tr3',
    courseId: 'c4',
    status: 'inprogress',
    progress: 25,
    stage: 'notes',
    startedOn: '2026-08-10',
    notesDone: false,
    slidesDone: false,
    videoDone: false,
    practiceDone: false,
    assessment: null,
    feedback: null,
    certificate: null,
  },
  {
    traineeId: 'u1',
    trainerId: 'tr1',
    courseId: 'c6',
    status: 'completed',
    progress: 100,
    stage: 'certificate',
    startedOn: '2026-04-01',
    notesDone: true,
    slidesDone: true,
    videoDone: true,
    practiceDone: true,
    assessment: { score: 82, passed: true, attemptedAt: '2026-05-15' },
    feedback: { contentDepth: 4, trainerDelivery: 5, operationalRelevance: 4, suggestions: 'Excellent practical examples.' },
    certificate: { id: 'CC-2026-0004821', issuedOn: '2026-05-16' },
  },
]

// ------------------- DEADLINES -------------------
export const deadlines = [
  { day: '25', month: 'AUG', label: 'Adaptive NWP Assessment', when: '25 Aug 2026, 11:00 AM', courseId: 'c3', type: 'assessment' },
  { day: '30', month: 'AUG', label: 'Training Feedback Submission', when: '30 Aug 2026', courseId: 'c1', type: 'feedback' },
  { day: '05', month: 'SEP', label: 'Course Completion: Data Analysis', when: '05 Sep 2026', courseId: 'c3', type: 'completion' },
]

// ------------------- ANNOUNCEMENTS / BROADCASTS -------------------
export const broadcasts = [  {
    id: 'b1',
    title: 'New Course Available!',
    body: 'Advanced Hydrological Modeling is now available. Enroll and enhance your skills.',
    audience: ['trainee'],
    date: '2026-08-20',
    cta: 'Enroll Now',
    courseId: 'c5',
  },
  {
    id: 'b2',
    title: 'Monsoon Forecasting Workshop',
    body: 'IMD Headquarters announces a national workshop on monsoon outlook integration. Register via your station coordinator.',
    audience: ['trainee', 'trainer'],
    date: '2026-08-22',
  },
  {
    id: 'b3',
    title: 'Annual Training Calendar Released',
    body: 'The FY 2026-27 scientific capacity building calendar is now published for all regional centres.',
    audience: ['trainee', 'trainer'],
    date: '2026-08-01',
  },
]

// Derive notification feed for navbar (already). Keep explicit for clarity
export const notifications = broadcasts.map((b) => ({
  id: b.id,
  title: b.title,
  body: b.body,
  date: b.date,
}))

// ------------------- REGIONAL COMPETENCY DATA -------------------
export const regionalCompetency = [
  { region: 'North', stations: ['New Delhi', 'Jaipur'], competency: 76, gaps: ['Hydrology', 'NWP'] },
  { region: 'West', stations: ['Mumbai', 'Ahmedabad', 'Pune'], competency: 82, gaps: ['Radar'] },
  { region: 'East', stations: ['Kolkata', 'Guwahati', 'Bhubaneswar'], competency: 64, gaps: ['Satellite', 'Disaster Management'] },
  { region: 'South', stations: ['Chennai', 'Bengaluru', 'Hyderabad', 'Thiruvananthapuram'], competency: 71, gaps: ['Climate Science'] },
]

// Map a weather station to its region (for competency aggregation)
export const stationRegionMap = regionalCompetency.reduce((acc, r) => {
  r.stations.forEach((s) => {
    acc[s] = r.region
  })
  return acc
}, {})

// ------------------- COMPETENCY RECORDS -------------------
// Per-trainee competency points derived from completed courses.
// { traineeId, traineeName, station, domain, competency, courseId }
export const seedCompetencyRecords = [
  { traineeId: 'u1', traineeName: 'Aarav Sharma', station: 'New Delhi', domain: 'Satellite Meteorology', competency: 82, courseId: 'c6' },
  { traineeId: 'u1', traineeName: 'Aarav Sharma', station: 'New Delhi', domain: 'NWP', competency: 60, courseId: 'c1' },
  { traineeId: 'u1', traineeName: 'Aarav Sharma', station: 'New Delhi', domain: 'Climate Science', competency: 75, courseId: 'c3' },
  { traineeId: 'u1', traineeName: 'Aarav Sharma', station: 'New Delhi', domain: 'Disaster Management', competency: 25, courseId: 'c4' },
]

// ------------------- VERIFICATION QUEUE (extra pending) -------------------
export const verificationQueue = [
  {
    id: 'v1',
    name: 'Nikhil Patil',
    role: 'TRAINEE',
    station: 'Pune',
    department: 'Regional Centre',
    empId: 'IMD-RC-9912',
    title: 'Observer',
    submitted: '2026-08-24',
    status: 'pending',
  },
  {
    id: 'v2',
    name: 'Dr. Meera Iyer',
    role: 'TRAINER',
    station: 'Bengaluru',
    department: 'Training Directorate',
    empId: 'IMD-TR-2203',
    title: 'Senior Scientist',
    submitted: '2026-08-23',
    status: 'pending',
    expertise: ['Satellite Meteorology', 'Climate Science'],
  },
  {
    id: 'v3',
    name: 'Anil Kumar',
    role: 'TRAINEE',
    station: 'Jaipur',
    department: 'Regional Centre',
    empId: 'IMD-RC-7731',
    title: 'Assistant Meteorologist',
    submitted: '2026-08-18',
    status: 'pending',
  },
]

// ------------------- TRAINER TRACKED TRAINEES -------------------
export const trackedTrainees = [
  { id: 't1', name: 'Aarav Sharma', station: 'New Delhi', progress: 60, score: 82, attempts: 2, status: 'inprogress', courseId: 'c1' },
  { id: 't2', name: 'Ishita Gupta', station: 'Mumbai', progress: 78, score: 88, attempts: 1, status: 'inprogress', courseId: 'c3' },
  { id: 't3', name: 'Rohan Deshmukh', station: 'Pune', progress: 100, score: 91, attempts: 1, status: 'completed', courseId: 'c1' },
  { id: 't4', name: 'Pooja Singh', station: 'Lucknow', progress: 45, score: null, attempts: 0, status: 'inprogress', courseId: 'c1' },
]
