import { z } from 'zod'

// Whitelist for GET/PATCH /api/users/me. Every editable professional-field maps
// to public.users; identity / permission fields (id, email, role, approvalStatus,
// firebaseUid, createdAt, updatedAt, profileCompletion, region, search_vector)
// are intentionally NOT in this schema and are stripped by zod before the
// service sees the request. `region` and `profileCompletion` are derived in the
// DB triggers; `organization` is a display attribute (IMD) and is likewise
// ignored rather than persisted, because public.users has no such column.

const professionalArray = (name, maxItems = 30) =>
  z
    .array(z.string().trim().max(150, `${name} items must be at most 150 characters.`))
    .max(maxItems, `${name} can have at most ${maxItems} items.`)
    .transform((v) => v.map((s) => s.trim()).filter(Boolean))
    .optional()

export const updateMeSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(120, 'Name must be at most 120 characters.')
    .optional(),
  title: z.string().trim().max(120, 'Designation must be at most 120 characters.').optional(),
  department: z.string().trim().max(120, 'Department must be at most 120 characters.').optional(),
  station: z.string().trim().max(100, 'Station must be at most 100 characters.').optional(),
  professionalSummary: z
    .string()
    .trim()
    .max(2000, 'Professional summary must be at most 2000 characters.')
    .optional(),
  // Accept both number and text forms (the editor sends a number, the mock layer
  // a string) and normalise to text because years_of_experience is a TEXT column.
  yearsOfExperience: z.coerce.string().trim().max(40, 'Experience must be at most 40 characters.').nullish(),
  expertise: professionalArray('Expertise'),
  specializations: professionalArray('Specializations'),
  skills: professionalArray('Skills'),
  qualifications: professionalArray('Qualifications'),
  trainingInterests: professionalArray('Training interests'),
  achievements: professionalArray('Achievements'),
  // Profile-photo metadata. The browser uploads the image to Cloudinary and
  // sends only the public_id + basic metadata; the bucket/path columns in
  // public.users record the reference (never an inline data URL).
  photoPublicId: z.string().trim().max(255, 'Photo reference is invalid.').optional(),
  photoMimeType: z.string().trim().max(100, 'Photo MIME type is invalid.').optional(),
  photoSize: z.coerce.number().int().min(0).max(20 * 1024 * 1024).optional(),
  photoFilename: z.string().trim().max(255, 'Photo filename is invalid.').optional(),
})

export const roleChangeSchema = z.object({
  role: z.enum(['ADMIN', 'TRAINER', 'TRAINEE']),
})

export const approvalChangeSchema = z.object({
  approvalStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
})