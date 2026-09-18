import { z } from 'zod'

// Public registration can REQUEST a TRAINEE or TRAINER account, but the schema
// below deliberately narrows `role` to exactly those two values so a client can
// NEVER self-assign ADMIN. Both roles are created with approval_status PENDING
// and verified by an administrator before access is granted. Any other role
// value (e.g. "ADMIN") fails validation with a clear error.
const professionalArray = (name, maxItems = 30) =>
  z
    .array(z.string().trim().max(150, `${name} items must be at most 150 characters.`))
    .max(maxItems, `${name} can have at most ${maxItems} items.`)
    .transform((v) => v.map((s) => s.trim()).filter(Boolean))
    .optional()

// Canonical full-name field. The public API field is `fullName` (matching the
// public.users `name` column and the profile response), but clients have also
// been seen sending `name` (the local form field). To keep ONE contract while
// remaining tolerant, `name` is accepted as an alias and normalised to
// `fullName` BEFORE validation — the requirement/enforcement is unchanged.
const nameField = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(120, 'Name must be at most 120 characters.')

const registerObject = z.object({
  fullName: nameField,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('A valid email address is required.')
    .max(254, 'Email must be at most 254 characters.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be at most 128 characters.'),
  station: z.string().trim().max(100, 'Station must be at most 100 characters.').optional(),
  department: z.string().trim().max(120, 'Department must be at most 120 characters.').optional(),
  empId: z.string().trim().max(80, 'Employee ID must be at most 80 characters.').optional(),
  title: z.string().trim().max(120, 'Designation must be at most 120 characters.').optional(),
  expertise: z.string().trim().max(120, 'Expertise must be at most 120 characters.').optional(),
  experience: z.string().trim().max(40, 'Experience must be at most 40 characters.').optional(),
  role: z.enum(['TRAINEE', 'TRAINER']).optional(),
  professionalSummary: z
    .string()
    .trim()
    .max(2000, 'Professional summary must be at most 2000 characters.')
    .optional(),
  specializations: professionalArray('Specializations'),
  skills: professionalArray('Skills'),
  qualifications: professionalArray('Qualifications'),
  trainingInterests: professionalArray('Training interests'),
  achievements: professionalArray('Achievements'),
})

export const registerSchema = z.preprocess((raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.fullName === undefined) {
    if (typeof raw.name === 'string') return { ...raw, fullName: raw.name }
  }
  return raw
}, registerObject)

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('A valid email address is required.')
    .max(254, 'Email must be at most 254 characters.'),
  password: z.string().min(1, 'Password is required.').max(128, 'Password must be at most 128 characters.'),
})