import { Router } from 'express'
import { authenticate } from '../middleware/authenticate.js'
import { validate } from '../middleware/validate.js'
import { uploadMaterialFile, uploadError } from '../middleware/upload.js'
import * as controller from '../controllers/course.controller.js'
import {
  createCourseSchema, updateCourseSchema,
  courseIdParamSchema, createSectionSchema, updateSectionSchema,
  sectionIdParamSchema, uploadSectionFieldsSchema, listCoursesQuerySchema,
  createQuestionSchema, updateQuestionSchema, questionIdParamSchema,
} from '../validators/course.validator.js'

const router = Router()

router.get('/', authenticate, validate(listCoursesQuerySchema, 'query'), controller.listCourses)
router.get('/:id', authenticate, validate(courseIdParamSchema, 'params'), controller.getCourse)
router.post('/', authenticate, validate(createCourseSchema), controller.createCourse)
router.patch('/:id', authenticate, validate(courseIdParamSchema, 'params'), validate(updateCourseSchema), controller.updateCourse)
router.delete('/:id', authenticate, validate(courseIdParamSchema, 'params'), controller.deleteCourse)

router.get('/:id/sections', authenticate, validate(courseIdParamSchema, 'params'), controller.listSections)
router.post('/:id/sections', authenticate, validate(courseIdParamSchema, 'params'), validate(createSectionSchema), controller.addSection)
router.post(
  '/:id/sections/upload',
  authenticate,
  validate(courseIdParamSchema, 'params'),
  uploadMaterialFile,
  uploadError,
  validate(uploadSectionFieldsSchema),
  controller.uploadSection,
)
router.delete('/:id/sections/:sectionId', authenticate, validate(courseIdParamSchema, 'params'), validate(sectionIdParamSchema, 'params'), controller.removeSection)

router.get('/:id/questions', authenticate, validate(courseIdParamSchema, 'params'), controller.listQuestions)
router.get('/:id/questions/:questionId', authenticate, validate(courseIdParamSchema, 'params'), validate(questionIdParamSchema, 'params'), controller.getQuestion)
router.post('/:id/questions', authenticate, validate(courseIdParamSchema, 'params'), validate(createQuestionSchema), controller.addQuestion)
router.patch('/:id/questions/:questionId', authenticate, validate(courseIdParamSchema, 'params'), validate(questionIdParamSchema, 'params'), validate(updateQuestionSchema), controller.updateQuestion)
router.delete('/:id/questions/:questionId', authenticate, validate(courseIdParamSchema, 'params'), validate(questionIdParamSchema, 'params'), controller.removeQuestion)

export default router
