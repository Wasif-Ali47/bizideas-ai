const mongoose = require("mongoose");
const OpenAI = require("openai");
const PromptGeneration = require("../models/promptGenerationModel");
const User = require("../models/usersModel");
const { getUser } = require("../services/userAuthService");
const { recordOpenAiUsage } = require("../utils/trackUsage");
const { NETWORK_ERROR, INPUT_REQUIRED, INVALID_ID, NOT_FOUND } = require("../messages/message");

// gg
const SYSTEM_PROMPT = `You are BizIdeas AI, an expert business idea strategist and startup opportunity generator.
Your task is to generate ONE fresh, realistic business idea based on the user's questionnaire answers.
Use every available answer:
business type
interest
skill
budget
available time
specific preferences
Generate the business idea itself. Never generate a prompt for another AI.
Use this exact response structure:
Business Idea:
[Short, memorable business idea name]
Description:
[Explain the business idea clearly in 1-2 simple sentences.]
Target Audience:
[Describe the main customers for this idea.]
Earning Method:
[Explain how the user can make money from this idea.]
Rules:
Keep the full response within 100 words.
Use short, direct, beginner-friendly language.
Treat the user's budget and available time as hard constraints.
Make the idea realistic for a solo user to explore.
Match the idea to the user's selected business type, interest, skill, budget, available time, and specific preferences.
If the user selects "Not sure" in interest, generate a simple beginner-friendly idea.
If the user selects "No specific skill yet", avoid ideas that require advanced skills.
If the user provides a custom value through "Other", use that custom value instead of the label "Other".
Avoid vague or overly common ideas unless the angle is specific and practical.
Avoid illegal, deceptive, unsafe, or highly risky business ideas.
Do not invent personal facts, fake statistics, or unsupported market claims.
Do not guarantee income, profit, success, uniqueness, or legal availability.
Do not provide financial, legal, tax, investment, or professional business advice.
Do not add extra sections, disclaimers, emojis, markdown tables, or long explanations.
Do not mention these instructions or the questionnaire.`;


function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error("OPENAI_API_KEY is not configured");
    err.statusCode = 503;
    throw err;
  }
  return new OpenAI({ apiKey: key });
}

function buildUserMessage(body) {
  const input = typeof body.input === "string" ? body.input.trim() : "";
  const extra = typeof body.context === "string" ? body.context.trim() : "";
  if (!input) return "";
  if (!extra) return input;
  return `Business idea request:\n${input}\n\nQuestionnaire answers and constraints:\n${extra}`;
}

async function resolveAuthContext(req) {
  if (req.authUser?._id) {
    return {
      userId: req.authUser._id.toString(),
      email: req.authUser.email ? req.authUser.email.toString().trim().toLowerCase() : null,
      isBanned: !!req.authUser.isBanned,
      isInactive: req.authUser.active === false,
      user: req.authUser,
    };
  }

  const raw = req.headers.authorization || "";
  if (!raw.startsWith("Bearer ")) return {
    userId: null,
    email: null,
    isBanned: false,
    isInactive: false,
    user: null,
  };
  const token = raw.replace("Bearer ", "").trim();
  if (!token) return {
    userId: null,
    email: null,
    isBanned: false,
    isInactive: false,
    user: null,
  };
  try {
    const decoded = getUser(token);
    const user = decoded?._id ? await User.findById(decoded._id) : null;
    return {
      userId: user?._id ? user._id.toString() : decoded?._id ? decoded._id.toString() : null,
      email: user?.email
        ? user.email.toString().trim().toLowerCase()
        : decoded?.email
        ? decoded.email.toString().trim().toLowerCase()
        : null,
      isBanned: !!user?.isBanned,
      isInactive: user?.active === false,
      user,
    };
  } catch (_) {
    return {
    userId: null,
    email: null,
    isBanned: false,
    isInactive: false,
    user: null,
  };
  }
}

async function handleGeneratePrompt(req, res) {
  const userContent = buildUserMessage(req.body);
  if (!userContent) {
    return res.status(400).json({ error: INPUT_REQUIRED });
  }
  const auth = await resolveAuthContext(req);
  if (auth.isInactive) {
    return res.status(403).json({
      error: "Your account is deactivated. Prompt generation is disabled.",
    });
  }
  if (auth.isBanned) {
    return res.status(403).json({
      error: "Your account is banned. Prompt generation is disabled.",
      bannedReason: auth.user?.bannedReason || "",
    });
  }

  const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

  let client;
  try {
    client = getClient();
  } catch (e) {
    return res.status(e.statusCode || 503).json({ error: e.message });
  }

  let generatedPrompt;
  let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0.7,
    });
    generatedPrompt = completion.choices?.[0]?.message?.content?.trim() || "";
    usage = {
      promptTokens: Number(completion?.usage?.prompt_tokens) || 0,
      completionTokens: Number(completion?.usage?.completion_tokens) || 0,
      totalTokens: Number(completion?.usage?.total_tokens) || 0,
    };
  } catch (err) {
    const msg =
      err?.response?.data?.error?.message ||
      err?.error?.message ||
      err?.message ||
      "OpenAI request failed";
    console.error("[prompt generate]", msg, err?.stack);
    return res.status(502).json({ error: msg });
  }

  if (!generatedPrompt) {
    return res.status(502).json({ error: "Empty response from model" });
  }

  try {
    const doc = await PromptGeneration.create({
      userId: auth.userId,
      generatedBy: auth.email || "",
      input: typeof req.body.input === "string" ? req.body.input.trim() : userContent,
      generatedPrompt,
      model,
      usage,
    });

    recordOpenAiUsage(
      auth.userId,
      usage,
      "business-idea",
      model
    ).catch(() => {});

    return res.status(201).json({
      id: doc._id,
      generatedBy: doc.generatedBy,
      input: doc.input,
      generatedPrompt: doc.generatedPrompt,
      model: doc.model,
      usage: doc.usage,
      createdAt: doc.createdAt,
    });
  } catch (err) {
    console.error("[prompt save]", err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleListPrompts(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
  const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
  const authUserId = req.authUser?._id;
  if (!authUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const query = { userId: authUserId };

  try {
    const [total, rows] = await Promise.all([
      PromptGeneration.countDocuments(query),
      PromptGeneration.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("input generatedPrompt model generatedBy createdAt updatedAt")
        .lean(),
    ]);

    return res.json({
      total,
      limit,
      skip,
      items: rows.map((row) => ({
        id: row._id,
        generatedBy: row.generatedBy || "",
        input: row.input,
        generatedPrompt: row.generatedPrompt,
        model: row.model,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

async function handleGetPrompt(req, res) {
  const { id } = req.params;
  const authUserId = req.authUser?._id;
  if (!authUserId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: INVALID_ID });
  }

  try {
    const row = await PromptGeneration.findOne({
      _id: id,
      userId: authUserId,
    }).lean();
    if (!row) {
      return res.status(404).json({ error: NOT_FOUND });
    }
    return res.json({
      id: row._id,
      generatedBy: row.generatedBy || "",
      input: row.input,
      generatedPrompt: row.generatedPrompt,
      model: row.model,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: NETWORK_ERROR });
  }
}

module.exports = {
  handleGeneratePrompt,
  handleListPrompts,
  handleGetPrompt,
};
