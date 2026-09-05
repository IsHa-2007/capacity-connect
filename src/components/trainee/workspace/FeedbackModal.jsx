import { useState } from 'react'
import { MessageSquare, Star } from 'lucide-react'
import { Button, Modal } from '../../common/ui'

const FACTORS = [
  { key: 'contentDepth', label: 'Content Depth' },
  { key: 'trainerDelivery', label: 'Trainer Delivery' },
  { key: 'operationalRelevance', label: 'Operational Relevance' },
]

export default function FeedbackModal({ open, onClose, course, onSubmitted }) {
  const [ratings, setRatings] = useState({ contentDepth: 0, trainerDelivery: 0, operationalRelevance: 0 })
  const [suggestions, setSuggestions] = useState('')
  const [error, setError] = useState('')

  const allRated = FACTORS.every((f) => ratings[f.key] > 0)

  const submit = () => {
    if (!allRated) {
      setError('Please provide a star rating for all three factors.')
      return
    }
    onSubmitted({ ...ratings, suggestions })
  }

  return (
    <Modal open={open} onClose={onClose} title="Course Feedback" size="max-w-xl">
      <div>
        <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-sky-light p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-white">
            <MessageSquare size={18} />
          </span>
          <div>
            <h4 className="font-semibold text-primary-deep">Mandatory Feedback</h4>
            <p className="text-sm text-slate-body">
              Your feedback on <b>{course.title}</b> is required to generate your verified certificate.
              It also feeds directly into trainer performance analytics.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          {FACTORS.map((f) => (
            <div key={f.key}>
              <p className="text-sm font-medium text-primary-deep">{f.label}</p>
              <div className="mt-1.5 flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRatings((r) => ({ ...r, [f.key]: star }))}
                  >
                    <Star
                      size={24}
                      className={
                        ratings[f.key] >= star
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-border-soft hover:text-amber-300'
                      }
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}

          <div>
            <p className="text-sm font-medium text-primary-deep">Suggestions / Additional Feedback</p>
            <textarea
              value={suggestions}
              onChange={(e) => setSuggestions(e.target.value)}
              rows={4}
              placeholder="Share your suggestions for improving this course, trainer delivery, or operational relevance..."
              className="mt-1.5 w-full rounded-lg border border-border-soft bg-sky-soft p-3 text-sm text-slate-deep outline-none placeholder:text-slate-muted focus:border-secondary focus:bg-white"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>Submit & Unlock Certificate</Button>
        </div>
      </div>
    </Modal>
  )
}
