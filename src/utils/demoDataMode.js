// DEV-ONLY demo data toggle.
//
// Setting VITE_DEMO_MODE=true switches the READ-ONLY demonstration surfaces
// (regional heatmap, admin dashboard figures, officer dispatch, trainer
// matching, seeded broadcasts/notifications) to display the seeded demo dataset
// from mockData.js — even while signed in with a REAL Supabase account.
//
// It NEVER affects authentication (login stays entirely backend-driven) and
// never reroutes writes: any action a real user takes still reaches the real
// backend. The flag is inert in production builds (import.meta.env.DEV is false
// there), so it can never ship demo data to a live deployment.
export const DEMO_MODE = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true'