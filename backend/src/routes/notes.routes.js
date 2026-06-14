const express = require('express');
const { prisma } = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// ============ SCHEMAS & CONSTANTS ============
const NOTE_TAGS = ['GENERAL', 'IMPORTANT', 'FOLLOW_UP', 'TODO'];
const MAX_TITLE_LENGTH = 500;
const MAX_CONTENT_LENGTH = 10000;
const NOTES_PAGE_SIZE = 50;

/**
 * Helper: Generate title from content if not provided
 * Takes first 60 characters of content
 */
const generateTitle = (content) => {
  if (!content) return '';
  return content.trim().slice(0, 60);
};

/**
 * Helper: Validate note data
 */
const validateNoteData = (data, isUpdate = false) => {
  const errors = [];

  if (!isUpdate) {
    // Create: content is required
    if (!data.content || typeof data.content !== 'string' || !data.content.trim()) {
      errors.push('Content is required and must be a non-empty string');
    }
    if (data.content && data.content.length > MAX_CONTENT_LENGTH) {
      errors.push(`Content must be less than ${MAX_CONTENT_LENGTH} characters`);
    }
  } else {
    // Update: content is optional but validated if provided
    if (data.content !== undefined) {
      if (typeof data.content !== 'string' || !data.content.trim()) {
        errors.push('Content must be a non-empty string');
      }
      if (data.content && data.content.length > MAX_CONTENT_LENGTH) {
        errors.push(`Content must be less than ${MAX_CONTENT_LENGTH} characters`);
      }
    }
  }

  // Title is always optional, but validated if provided
  if (data.title !== undefined) {
    if (typeof data.title !== 'string') {
      errors.push('Title must be a string');
    }
    if (data.title && data.title.length > MAX_TITLE_LENGTH) {
      errors.push(`Title must be less than ${MAX_TITLE_LENGTH} characters`);
    }
  }

  // Validate category (formerly tag)
  if (data.category && !NOTE_TAGS.includes(data.category)) {
    errors.push(`Category must be one of: ${NOTE_TAGS.join(', ')}`);
  }

  return errors;
};

/**
 * Helper: Format note for API response
 */
const formatNote = (dbNote) => ({
  id: String(dbNote.id),
  title: dbNote.title || '',
  content: dbNote.content,
  category: dbNote.category || dbNote.tag || 'GENERAL',
  created_at: dbNote.created_at.toISOString(),
  updated_at: dbNote.updated_at.toISOString(),
});

// ============ ROUTES ============

/**
 * GET /api/personal-notes
 * Get all notes for authenticated agent with optional pagination and filters
 */
router.get('/personal-notes', verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { page = 1, limit = NOTES_PAGE_SIZE, tag, category, search } = req.query;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // Build where clause
    const where = {
      agent_id: agentId,
      deleted_at: null,
    };

    // Filter by category (or legacy tag) if provided
    if ((category && NOTE_TAGS.includes(category)) || (tag && NOTE_TAGS.includes(tag))) {
      where.category = category || tag;
    }

    // Search in title and content if provided
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await prisma.personalNote.count({ where });

    // Get paginated notes - ordered by creation date (newest first)
    const notes = await prisma.personalNote.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
    });

    const formattedNotes = notes.map(formatNote);

    // Return in both formats for compatibility
    res.status(200).json(
      ApiResponse.success(
        `Found ${formattedNotes.length} notes`,
        {
          results: formattedNotes,
          data: formattedNotes,
          pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / parseInt(limit)),
          },
        }
      )
    );
  } catch (error) {
    console.error('[Get Notes Error]:', error);
    res.status(500).json(
      ApiResponse.error('Failed to fetch notes', null, 500)
    );
  }
});

/**
 * POST /api/personal-notes
 * Create a new note
 */
router.post('/personal-notes', verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { title, content } = req.body;
    // Accept both `category` (canonical) and `tag` (legacy / frontend alias)
    const category = req.body.category || req.body.tag || 'GENERAL';

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // Validate input
    const errors = validateNoteData({ title, content, category });
    if (errors.length > 0) {
      return res.status(400).json(
        ApiResponse.error('Validation failed', errors, 400)
      );
    }

    // Generate title from content if not provided
    const noteTitle = title && title.trim() ? title.trim() : generateTitle(content);

    // Create note
    const note = await prisma.personalNote.create({
      data: {
        title: noteTitle,
        content: content.trim(),
        category: category || 'GENERAL',
        agent_id: agentId,
      },
    });

    const formattedNote = formatNote(note);

    res.status(201).json(
      ApiResponse.success('Note created successfully', formattedNote, 201)
    );
  } catch (error) {
    console.error('[Create Note Error]:', error);
    res.status(500).json(
      ApiResponse.error('Failed to create note', null, 500)
    );
  }
});

/**
 * GET /api/personal-notes/:noteId
 * Get a single note by ID
 */
router.get('/personal-notes/:noteId', verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { noteId } = req.params;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // Find note
    const note = await prisma.personalNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      return res.status(404).json(
        ApiResponse.error('Note not found', null, 404)
      );
    }

    // Check ownership - only agent who created note can view it
    if (note.agent_id !== agentId && !['ADMIN', 'SUPER_ADMIN'].includes(String(req.user?.role || req.user?.type || '').toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error('Unauthorized to access this note', null, 403)
      );
    }

    // Respect soft delete
    if (note.deleted_at) {
      return res.status(404).json(
        ApiResponse.error('Note not found', null, 404)
      );
    }

    const formattedNote = formatNote(note);

    res.status(200).json(
      ApiResponse.success('Note retrieved successfully', formattedNote)
    );
  } catch (error) {
    console.error('[Get Note Error]:', error);
    res.status(500).json(
      ApiResponse.error('Failed to fetch note', null, 500)
    );
  }
});

/**
 * PATCH /api/personal-notes/:noteId
 * Update a note (title and/or content)
 */
router.patch('/personal-notes/:noteId', verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { noteId } = req.params;
    const { title, content } = req.body;
    // Accept both `category` (canonical) and `tag` (legacy / frontend alias)
    const category = req.body.category || req.body.tag;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // Find note
    const note = await prisma.personalNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      return res.status(404).json(
        ApiResponse.error('Note not found', null, 404)
      );
    }

    // Check ownership
    if (note.agent_id !== agentId && !['ADMIN', 'SUPER_ADMIN'].includes(String(req.user?.role || req.user?.type || '').toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error('Unauthorized to update this note', null, 403)
      );
    }

    // Respect soft delete
    if (note.deleted_at) {
      return res.status(404).json(
        ApiResponse.error('Note not found', null, 404)
      );
    }

    // Validate input
    const errors = validateNoteData({ title, content, category }, true);
    if (errors.length > 0) {
      return res.status(400).json(
        ApiResponse.error('Validation failed', errors, 400)
      );
    }

    // Build update data
    const updateData = {};
    if (content !== undefined) {
      updateData.content = content.trim();
    }
    if (title !== undefined) {
      updateData.title = title.trim() || generateTitle(content || note.content);
    }
    if (category !== undefined && NOTE_TAGS.includes(category)) {
      // Store on the canonical `category` field (formatNote also falls back to `tag`)
      updateData.category = category;
    }

    // Update note
    const updatedNote = await prisma.personalNote.update({
      where: { id: noteId },
      data: updateData,
    });

    const formattedNote = formatNote(updatedNote);

    res.status(200).json(
      ApiResponse.success('Note updated successfully', formattedNote)
    );
  } catch (error) {
    console.error('[Update Note Error]:', error);
    res.status(500).json(
      ApiResponse.error('Failed to update note', null, 500)
    );
  }
});

/**
 * DELETE /api/personal-notes/:noteId
 * Soft delete a note (sets deleted_at timestamp)
 */
router.delete('/personal-notes/:noteId', verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { noteId } = req.params;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // Find note
    const note = await prisma.personalNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      return res.status(404).json(
        ApiResponse.error('Note not found', null, 404)
      );
    }

    // Check ownership
    if (note.agent_id !== agentId && !['ADMIN', 'SUPER_ADMIN'].includes(String(req.user?.role || req.user?.type || '').toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error('Unauthorized to delete this note', null, 403)
      );
    }

    // Soft delete - set deleted_at timestamp
    const deletedNote = await prisma.personalNote.update({
      where: { id: noteId },
      data: { deleted_at: new Date() },
    });

    res.status(200).json(
      ApiResponse.success(
        'Note deleted successfully',
        { id: deletedNote.id, deleted_at: deletedNote.deleted_at }
      )
    );
  } catch (error) {
    console.error('[Delete Note Error]:', error);
    res.status(500).json(
      ApiResponse.error('Failed to delete note', null, 500)
    );
  }
});

/**
 * DELETE /api/personal-notes/:noteId/permanent
 * Permanently delete a note (hard delete - removes from database)
 */
router.delete('/personal-notes/:noteId/permanent', verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { noteId } = req.params;

    // Only admins can permanently delete notes
    if (!['ADMIN', 'SUPER_ADMIN'].includes(String(req.user?.role || req.user?.type || '').toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error('Only admins can permanently delete notes', null, 403)
      );
    }

    // Find note
    const note = await prisma.personalNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      return res.status(404).json(
        ApiResponse.error('Note not found', null, 404)
      );
    }

    // Hard delete
    await prisma.personalNote.delete({
      where: { id: noteId },
    });

    res.status(200).json(
      ApiResponse.success('Note permanently deleted', { id: noteId })
    );
  } catch (error) {
    console.error('[Permanent Delete Note Error]:', error);
    res.status(500).json(
      ApiResponse.error('Failed to permanently delete note', null, 500)
    );
  }
});

/**
 * GET /api/personal-notes/stats/summary
 * Get notes statistics for authenticated agent
 */
router.get('/personal-notes/stats/summary', verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error('Agent ID not found in token', null, 401)
      );
    }

    // Get stats
    const total = await prisma.personalNote.count({
      where: { agent_id: agentId, deleted_at: null },
    });

    const byCategory = await prisma.personalNote.groupBy({
      by: ['category'],
      where: { agent_id: agentId, deleted_at: null },
      _count: { category: true },
    });

    const categoryCounts = NOTE_TAGS.reduce((acc, cat) => {
      acc[cat] = byCategory.find(t => t.category === cat)?._count?.category || 0;
      return acc;
    }, {});

    const stats = {
      total,
      by_category: categoryCounts,
      created_today: await prisma.personalNote.count({
        where: {
          agent_id: agentId,
          deleted_at: null,
          created_at: {
            gte: new Date(new Date().toDateString()),
          },
        },
      }),
    };

    res.status(200).json(
      ApiResponse.success('Notes statistics retrieved successfully', stats)
    );
  } catch (error) {
    console.error('[Get Notes Stats Error]:', error);
    res.status(500).json(
      ApiResponse.error('Failed to fetch notes statistics', null, 500)
    );
  }
});

module.exports = router;
