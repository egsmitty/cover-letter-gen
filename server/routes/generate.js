const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-opus-4-6';
const MAX_TOKENS = { short: 800, standard: 1024, detailed: 1500 };

const VALID_TONES = ['professional', 'friendly', 'formal'];
const VALID_LENGTHS = ['short', 'standard', 'detailed'];
const VALID_FOCUSES = ['technical', 'leadership', 'culture'];
const MAX_RESUME_LEN = 30000;
const MAX_JOB_LEN = 15000;

const STYLE_RULES = `
STYLE RULES — follow every one of these without exception:
- Vary sentence length aggressively. Some sentences must be under 6 words. Some should run longer with natural rhythm. Never write three consecutive sentences of similar length.
- At least one paragraph must be only 1-2 sentences. Paragraph lengths should be visibly unequal.
- Use contractions freely: don't, I've, I'm, it's, that's, I'd.
- Vary how every paragraph and sentence begins. Do not start more than one paragraph with "I". Use "My", "At", "When", "After", "That", "What", "There" to open sentences.
- Use active voice throughout.
- Write one intentional sentence fragment for emphasis. One only. Humans do this.
- No em dashes (—). Replace with a comma, a period, or restructure.
- No semicolons.
- No bullet points, bold text, or any markdown formatting.
- No lists of three adjectives or skills in a row.
- No parallel structures like "I am skilled in X, proficient in Y, and experienced in Z."
- No "not only...but also" constructions.
- No "it's not X, it's Y" constructions.
- No rhetorical questions.
- No trailing -ing phrases that restate what was just said.
- No compulsive summaries. No "in conclusion," "overall," or "in summary."
- Do not repeat the company name more than twice. No synonym substitutions ("the firm," "the company," "the organization").
- State things directly. Do not hedge with "I believe," "I think," or "I feel." If something is true, say it.
- The closing must be 1-2 sentences maximum. Confident, not grateful. No "I look forward to," no "at your earliest convenience," no trailing thanks.
- Avoid predictable word choices. If the obvious word comes to mind first, find a more specific one.

BANNED WORDS AND PHRASES — do not use any of these or their close synonyms:
delve, embark, tapestry, realm, landscape, unlock, revolutionize, harness, leverage,
optimize, streamline, foster, pivotal, nuanced, seamless, robust, cutting-edge,
innovative, groundbreaking, remarkable, ever-evolving, game-changer, disruptive,
testament, beacon, synergy, moreover, furthermore, additionally, hence, thus,
it's important to note, it is worth noting, today's fast-paced world,
plays a significant role, serves as a testament, aims to explore, watershed moment,
I am writing to express my interest, I am a highly motivated individual,
I am confident that, Thank you for your consideration, I hope this helps,
utilize, utilizing, elucidate, illuminate, unveil, skyrocket, treasure trove,
showcasing, aligns, impacting, surpassing, dynamic, passionate, results-driven,
I am excited to apply, I am excited about, strong interest in,
bring to the table, hit the ground running, track record, proven track record,
opportunity to contribute, I'd love to, I'd be thrilled, what sets me apart,
what drew me to, in terms of, when it comes to, at the end of the day,
with that in mind, to that end, having said that, needless to say,
I am committed to, dedicated to, my passion for, my journey`;

function buildCoverLetterPrompt({ resumeText, jobPosting, tone, length, focus, companyName, positionTitle }) {
  const wordTargets = { short: '220-260', standard: '320-380', detailed: '480-540' };
  const wordTarget = wordTargets[VALID_LENGTHS.includes(length) ? length : 'standard'];

  const toneGuide = {
    professional: 'confident and direct — like a capable person speaking to a peer, not performing eagerness',
    friendly: 'warm and genuine — like someone who is good at their job and also easy to work with',
    formal: 'measured and precise — traditional professional register, no contractions',
  };
  const toneDesc = toneGuide[VALID_TONES.includes(tone) ? tone : 'professional'];

  const focusGuide = {
    technical: 'technical skills, specific tools used, and measurable results',
    leadership: 'ownership, team impact, and moments where this person drove something forward',
    culture: 'why this specific company and role — what connects their background to this team\'s mission',
  };
  const focusDesc = focusGuide[VALID_FOCUSES.includes(focus) ? focus : 'technical'];

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const contextLine = [
    companyName && `The company is ${companyName}.`,
    positionTitle && `The role is ${positionTitle}.`,
  ].filter(Boolean).join(' ');

  return `You are writing a cover letter on behalf of a real job applicant. Output only the letter — no subject line, no commentary, nothing before or after the letter itself.

${contextLine}

HEADER — Every letter must begin with a header block using single line breaks (not blank lines) within it. Extract the applicant's full name, email, and phone number from the resume. Format it exactly like this:

[Full Name]
[email] · [phone]
${today}

[Company name if known, otherwise omit this line]

Dear Hiring Team,

Then write the body paragraphs, each separated by a blank line. Close with a sign-off on its own line:

Sincerely,
[Full Name]

The word count target (${wordTarget} words) applies to the body paragraphs only, not the header or sign-off.

The letter must pass AI detection. A tool like GPTZero or Originality.ai should not flag it. That means: unpredictable sentence rhythms, specific grounded details, no smooth AI transitions, no formulaic structure. Write like a person who types fast and knows what they're doing.
${STYLE_RULES}

WHAT TO ACTUALLY DO:
- Open the first body paragraph with a specific hook — a real detail from their background or the job that earns attention. Not "I am applying for."
- Pull concrete details from the resume: actual job titles, real project names, specific numbers or metrics, named technologies.
- Reference 1-2 things from the job posting that genuinely connect to the candidate's experience — don't just mirror the language back.
- Include at least one sentence that feels like a lived moment, not a summary. Something specific enough that it could only apply to this person.
- The closing body paragraph is 1-2 sentences. Stop when the thought is done.

Tone: ${toneDesc}
Target body length: ${wordTarget} words
Emphasis: ${focusDesc}

Resume:
${resumeText}

Job Posting:
${jobPosting}

Write the cover letter now.`;
}

router.post('/parse-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { mimetype, buffer, originalname } = req.file;

  try {
    let text = '';

    if (mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf')) {
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
  if (resumeText.length > MAX_RESUME_LEN) return res.status(400).json({ error: 'Resume text is too long.' });
  if (jobPosting.length > MAX_JOB_LEN) return res.status(400).json({ error: 'Job posting is too long.' });

  const safeCompany = typeof companyName === 'string' ? companyName.slice(0, 100) : '';
  const safePosition = typeof positionTitle === 'string' ? positionTitle.slice(0, 100) : '';

  const prompt = buildCoverLetterPrompt({ resumeText, jobPosting, tone, length, focus, companyName: safeCompany, positionTitle: safePosition });

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS[VALID_LENGTHS.includes(length) ? length : 'standard'],
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content?.[0];
    if (!textBlock || textBlock.type !== 'text' || !textBlock.text) {
      throw new Error('Unexpected response from AI. Please try again.');
    }

    res.json({ letter: textBlock.text.trim() });
  } catch (err) {
    console.error('Claude error:', err);
    const msg = err.status === 429
      ? 'Rate limit reached. Please wait a moment and try again.'
      : err.message || 'Failed to generate cover letter.';
    res.status(500).json({ error: msg });
  }
});

router.post('/rethink-paragraph', async (req, res) => {
  const { paragraph, fullLetter, resumeText, jobPosting, companyName, positionTitle } = req.body;

  if (!paragraph || !fullLetter || !resumeText || !jobPosting) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const safeCompany = typeof companyName === 'string' ? companyName.slice(0, 100) : '';
  const safePosition = typeof positionTitle === 'string' ? positionTitle.slice(0, 100) : '';
  const context = [safeCompany && `Company: ${safeCompany}`, safePosition && `Role: ${safePosition}`].filter(Boolean).join(' | ');

  const prompt = `You are rewriting a single paragraph from a cover letter. Return only the replacement paragraph — nothing else, no explanation.

${context ? `Context: ${context}` : ''}

The paragraph to rewrite:
"""
${paragraph}
"""

The full letter for context (do not rewrite this — use it only as reference):
"""
${fullLetter}
"""

Resume (for specific details to draw from):
"""
${resumeText.slice(0, 8000)}
"""

Job posting (for context):
"""
${jobPosting.slice(0, 4000)}
"""

Write a different version of that paragraph. It must:
- Convey the same general purpose but approach it from a different angle or with different specific details
- Match the tone and register of the rest of the letter
- Sound like a human wrote it — not AI
- Not repeat phrases already used elsewhere in the letter
${STYLE_RULES}

Output only the new paragraph. No quotes, no labels, no explanation.`;

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      temperature: 1,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = message.content?.[0];
    if (!textBlock || textBlock.type !== 'text' || !textBlock.text) {
      throw new Error('Unexpected response from AI. Please try again.');
    }

    res.json({ paragraph: textBlock.text.trim() });
  } catch (err) {
    console.error('Rethink error:', err);
    const msg = err.status === 429
      ? 'Rate limit reached. Please wait a moment and try again.'
      : err.message || 'Failed to rethink paragraph.';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
