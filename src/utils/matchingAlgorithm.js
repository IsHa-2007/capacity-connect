// Trainer-to-Subject weighted matching engine

/**
 * Compute a match percentage between a trainer and a course/topic/domain.
 * Weights:
 *  - Domain expertise overlap (40%)
 *  - Past trainee feedback score (20%)
 *  - Overall trainer rating (20%)
 *  - Availability (10%)
 *  - Previous training performance / history (10%)
 * @param {Object} trainer
 * @param {Object|string} course - a course object with domain + tags, or a bare domain string
 */
export function computeMatch(trainer, course) {
  const domainValue = typeof course === 'string' ? course : (course?.domain ?? '')
  const tags = typeof course === 'string' ? [] : (course?.tags || [])
  const domainTokens = [domainValue, ...tags].map((t) => normalize(t))
  const expertiseTokens = (trainer.expertise || []).map((t) => normalize(t))

  let overlap = 0
  domainTokens.forEach((tok) => {
    if (expertiseTokens.some((et) => et === tok || et.includes(tok) || tok.includes(et))) overlap++
  })
  const domainScore = domainTokens.length ? overlap / domainTokens.length : 0

  const feedbackScore = (trainer.feedbackScore ?? trainer.rating ?? 4) / 5
  const ratingScore = (trainer.rating ?? 4) / 5
  const availabilityScore = trainer.availability ? 1 : 0.3
  const experienceScore = Math.min(1, (trainer.history ?? 0) / 5)

  const weighted =
    domainScore * 0.4 +
    feedbackScore * 0.2 +
    ratingScore * 0.2 +
    availabilityScore * 0.1 +
    experienceScore * 0.1

  return {
    percentage: Math.round(weighted * 100),
    breakdown: {
      domain: Math.round(domainScore * 100),
      feedback: Math.round(feedbackScore * 100),
      rating: Math.round(ratingScore * 100),
      availability: Math.round(availabilityScore * 100),
      experience: Math.round(experienceScore * 100),
    },
  }
}

/**
 * Rank all trainers for a given course.
 * @returns array of { trainer, match }
 */
export function rankTrainersForCourse(trainers, course) {
  return trainers
    .map((trainer) => ({ trainer, match: computeMatch(trainer, course) }))
    .sort((a, b) => b.match.percentage - a.match.percentage)
}

/**
 * Rank all trainers for a given domain. Uses the same weighted engine,
 * matching solely against the selected domain name.
 * @returns array of { trainer, match }
 */
export function rankTrainersForDomain(trainers, domain) {
  return trainers
    .map((trainer) => ({ trainer, match: computeMatch(trainer, domain) }))
    .sort((a, b) => b.match.percentage - a.match.percentage)
}

const normalize = (s) => s.toLowerCase().trim()
