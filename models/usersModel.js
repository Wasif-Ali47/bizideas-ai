const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },
    email: {
      type: String,
      unique: true,
    },
    profession: {
      type: String,
    },
    password: {
      type: String,
    },
    image: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    otp: {
      type: String,
    },
    emailVerified: {
      type: Boolean,
    },
    googleId: {
      type: String,
    },
    isGuest: {
      type: Boolean,
      default: false,
      index: true,
    },
    isPro: {
      type: Boolean,
      default: false,
      index: true,
    },
    guestDeviceId: {
      type: String,
      trim: true,
      index: true,
    },
    resetOTP: {
      type: String,
    },
    creationsPublic: {
      type: Boolean,
      default: true,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    isBanned: {
      type: Boolean,
      default: false,
      index: true,
    },
    bannedAt: {
      type: Date,
      default: null,
    },
    bannedReason: {
      type: String,
      default: "",
      trim: true,
    },
    deviceTokens: [
      {
        token: {
          type: String,
          required: true,
        },
        deviceType: {
          type: String,
          default: "unknown",
        },
        deviceInfo: {
          os: { type: String, default: "" },
          appVersion: { type: String, default: "" },
        },
        registeredAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    openAiUsage: {
      promptTokens: { type: Number, default: 0 },
      completionTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
      requestCount: { type: Number, default: 0 },
      lastUsedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

module.exports = User;
