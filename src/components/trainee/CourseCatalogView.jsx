import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useCourses } from '../../context/CourseContext'
import { Card, EmptyState } from '../common/ui'
import CourseCard from './CourseCard'
import EnrollmentModal from './EnrollmentModal'

const domains = ['All Domains', 'Radar', 'NWP', 'Satellite', 'Climate', 'Hydrology', 'Disaster']

// Reusable course catalog: filters + grid + enrollment modal. Used both as the
// "Explore Catalog" tab within the trainee home and as a dedicated
// /trainee/catalog route so "Explore Courses" points to a real page.
export default function CourseCatalogView() {
  const { courseCatalog, getEnrollment } = useCourses()
  const [query, setQuery] = useState('')
  const [domain, setDomain] = useState('All Domains')
  const [difficulty, setDifficulty] = useState('All Levels')
  const [selectedCourse, setSelectedCourse] = useState(null)

  const filteredCatalog = useMemo(() => {
    return courseCatalog.filter((c) => {
      const matchQ =
        !query ||
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase()) ||
        c.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()))
      const matchD = domain === 'All Domains' || c.domain.includes(domain) || c.tags.includes(domain)
      const matchDiff = difficulty === 'All Levels' || c.difficulty === difficulty
      return matchQ && matchD && matchDiff
    })
  }, [courseCatalog, query, domain, difficulty])

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-secondary p-6 text-white sm:p-8">
        <h1 className="text-2xl font-semibold">Course Catalog</h1>
        <p className="mt-1 max-w-lg text-sm text-blue-100">
          Discover scientific courses across all domains — radar, NWP, satellite,
          climate, hydrology, and disaster management.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border-soft bg-white p-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-muted" size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses, domains, topics..."
            className="w-full rounded-lg border border-border-soft bg-sky-soft py-2 pl-9 pr-3 text-sm outline-none placeholder:text-slate-muted focus:border-secondary focus:bg-white"
          />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="hidden text-slate-muted sm:block" />
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="rounded-lg border border-border-soft bg-sky-soft px-3 py-2 text-sm text-slate-deep outline-none focus:border-secondary"
            >
              {domains.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="rounded-lg border border-border-soft bg-sky-soft px-3 py-2 text-sm text-slate-deep outline-none focus:border-secondary"
          >
            {['All Levels', 'Beginner', 'Intermediate', 'Advanced'].map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredCatalog.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredCatalog.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              enrollment={getEnrollment(c.id)}
              onDetails={() => setSelectedCourse(c)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={Search}
            title="No courses found"
            description="Try adjusting your search or clearing the filters."
          />
        </Card>
      )}

      <EnrollmentModal
        course={selectedCourse}
        open={!!selectedCourse}
        onClose={() => setSelectedCourse(null)}
      />
    </div>
  )
}
