const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VALID_TONES = ['professional', 'friendly', 'formal'];
const VALID_LENGTHS = ['short', 'standard', 'detailed'];
const VALID_FOCUSES = ['technical', 'leadership', 'culture'];
const MAX_RESUME_LEN = 30000;
const MAX_JOB_LEN = 15000;

router.post('/parse-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { mimetype, buffer, originalname } = req.file;

  try {
    let text = '';

    if (mimetype === 'application/pdf') {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      originalname.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else if (mimetype === 'text/plain') {
      text = buffer.toString('utf-8');
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Upload PDF, DOCX, or TXT.' });
    }

    if (!text.trim()) return res.status(400).json({ error: 'Could not extract text from file.' });

    res.json({ text: text.trim().slice(0, MAX_RESUME_LEN) });
  } catch (err) {
    console.error('Parse error:', err);
    res.status(400).json({ error: 'Failed to parse resume. Make sure the file is not corrupted.' });
  }
});

router.post('/generate', async (req, res) => {
  const { resumeText, jobPosting, tone, length, focus, companyName, positionTitle } = req.body;

  if (!resumeText || !jobPosting) {
    return res.status(400).json({ error: 'Resume and job posting are required.' });
  }

  if (resumeText.length > MAX_RESUME_LEN) {
    return res.status(400).json({ error: 'Resume text is too long.' });
  }

  if (jobPosting.length > MAX_JOB_LEN) {
    return res.status(400).json({ error: 'Job posting is too long.' });
  }

  const safeCompany = typeof companyName === 'string' ? companyName.slice(0, 100) : '';
  const safePosition = typeof positionTitle === 'string' ? positionTitle.slice(0, 100) : '';

  const wordTargets = { short: '220-260', standard: '320-380', detailed: '480-540' };
  const wordTarget = wordTargets[VALID_LENGTHS.includes(length) ? length : 'standard'];

  const toneGuide = {
    professional: 'confident and polished without being stiff',
    friendly: 'warm, personable, and approachable while still professional',
    formal: 'measured, precise, and traditionally professional',
  };
  const toneDesc = toneGuide[VALID_TONES.includes(tone) ? tone : 'professional'];

  const focusGuide = {
    technical: 'technical skills, tools, and quantifiable achievements',
    leadership: 'leadership, team impact, and organizational influence',
    culture: 'passion for the mission, alignment with company values, and cultural fit',
  };
  const focusDesc = focusGuide[VALID_FOCUSES.includes(focus) ? focus : 'technical'];

  const contextLine = [
    safeCompany && `The company is ${safeCompany}.`,
    safePosition && `The role being applied for is ${safePosition}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const prompt = `You are helping someone write a cover letter. Your only job is to produce the letter itself — no commentary, no subject lines, no explanations.

${contextLine}

Write a cover letter that sounds like a real person wrote it. It should feel natural and direct, not like AI output.

Rules:
- Do NOT open with "I am excited to apply" or any variation of that phrase
- Do NOT open with "I am writing to express my interest in the [role] at [company]" or any variation
- Do NOT use buzzwords like "passionate", "leverage", "synergy", "results-driven", or "dynamic"
- Do NOT use a generic three-paragraph structure with a preamble, skills dump, and closing fluff
- Do NOT mirror the job description language back word-for-word
- DO write in first person with natural sentence rhythm — vary sentence length
- DO pull specific, concrete details from the resume (job titles, projects, metrics, technologies)
- DO reference 1-2 specific things from the job posting that genuinely connect to the candidate's background
- DO end with a clear, confident close — not overly eager

Tone: ${toneDesc}
Length: ${wordTarget} words
Emphasis: ${focusDesc}

Resume:
${resumeText}

Job Posting:
${jobPosting}

Write the cover letter now. Output only the letter text.`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content?.[0];
    if (!textBlock || textBlock.type !== 'text' || !textBlock.text) {
      throw new Error('Unexpected response from AI. Please try again.');
    }

    res.json({ letter: textBlock.text.trim() });
  } catch (err) {
    console.error('Claude error:', err);
    const message = err.status === 429
      ? 'Rate limit reached. Please wait a moment and try again.'
      : err.message || 'Failed to generate cover letter.';
    res.status(500).json({ error: message });
  }
});

module.exports = router;
