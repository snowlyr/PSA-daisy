"use client";

import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Restore theme preference
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") setDarkMode(true);
  }, []);

  // Persist theme preference
  useEffect(() => {
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (loading || !input.trim()) return;

    const trimmed = input.trim();
    const userMessage: Message = { role: "user", content: trimmed };
    const conversation = [...messages, userMessage];

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(
        process.env.NEXT_PUBLIC_CHAT_API || "/api/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: conversation }),
        }
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.error || response.statusText);
      }

      const data = await response.json();
      const reply =
        typeof data?.reply === "string"
          ? data.reply
          : "I wasn't able to generate a response.";

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: reply },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `**Error:** ${err?.message || "Unable to reach Daisy right now."}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`flex flex-col h-screen w-full transition-colors duration-500 ${
        darkMode
          ? "bg-gradient-to-b from-[#1c1c1c] to-[#2c2c2c] text-white"
          : "bg-gradient-to-b from-[#fafafa] to-[#e5e5e5] text-gray-900"
      }`}
    >
      {/* Header */}
      <header
        className={`flex justify-between items-center px-6 py-4 mb-4 border-b backdrop-blur-md transition-all duration-500 ${
          darkMode
            ? "bg-gray-900/40 border-gray-700"
            : "bg-white/60 border-gray-200"
        }`}
        style={{
          borderImage:
            "linear-gradient(to right, #bbb, #999, #bbb) 1", // subtle metallic gradient
        }}
      >
        <h1
          className={`text-2xl font-semibold tracking-wide drop-shadow-sm ${
            darkMode ? "text-gray-100" : "text-gray-800"
          }`}
        >
          Daisy v1.0
        </h1>

        <motion.button
            whileHover={{ scale: 1.1, rotate: 10 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setDarkMode(!darkMode)}
            className={`p-2 rounded-full transition-all border shadow-sm hover:shadow-md focus:outline-none ${darkMode
                    ? "bg-gradient-to-br from-yellow-400/20 to-yellow-600/10 border-yellow-400/50"
                    : "bg-gradient-to-br from-gray-100 to-gray-300 border-gray-400/60"
                }`}
            title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
            <motion.div
                key={darkMode ? "sun" : "moon"}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
            >
                {darkMode ? (
                    <Sun className="w-5 h-5 text-yellow-300 drop-shadow-[0_0_6px_rgba(255,215,0,0.7)]" />
                ) : (
                    <Moon className="w-5 h-5 text-gray-700 drop-shadow-[0_0_4px_rgba(0,0,0,0.2)]" />
                )}
            </motion.div>
        </motion.button>

      </header>

      {/* Chat Area */}
      <div
          className={`flex-1 overflow-y-auto p-6 rounded-3xl shadow-inner flex flex-col space-y-4 border mx-4 transition-all duration-500 ${
            darkMode
              ? "bg-[#1f1f1f] border-gray-700" // Solid dark background
              : "bg-white border-gray-200 shadow-sm" // Clean light background
          }`}
      >

        {messages.length === 0 && (
          <p className="text-gray-500 text-center mt-32">
            Type a message below to start the conversation
          </p>
        )}

        <AnimatePresence>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{
                opacity: 0,
                x: m.role === "user" ? -50 : 50,
                y: 10,
              }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 70, damping: 15 }}
              className={`inline-block px-5 py-3 rounded-3xl shadow-lg transition-all duration-300 max-w-full sm:max-w-[70%] ${
                m.role === "user"
                  ? darkMode
                    ? "self-start bg-gradient-to-r from-gray-700 to-gray-600 text-white hover:from-gray-600 hover:to-gray-500"
                    : "self-start bg-gradient-to-r from-gray-700 to-gray-600 text-white hover:from-gray-600 hover:to-gray-500"
                  : darkMode
                    ? "self-end bg-gradient-to-r from-gray-800 to-gray-700 text-white hover:from-gray-700 hover:to-gray-600"
                    : "self-end bg-gradient-to-r from-gray-800 to-gray-700 text-white hover:from-gray-700 hover:to-gray-600"
              }`}
            >
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing Indicator */}
        <AnimatePresence>
          {loading && (
            <motion.div
              key="typing-indicator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={`self-end rounded-3xl px-5 py-3 shadow-md max-w-[40%] flex justify-center items-center space-x-2 ${
                darkMode
                  ? "bg-gradient-to-r from-gray-800 to-gray-700"
                  : "bg-gradient-to-r from-gray-800 to-gray-700"
              }`}
            >
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-2 h-2 bg-white rounded-full"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="flex items-center gap-3 mt-4 w-full px-4 mb-4">
        <div className="flex-1 relative">
          <textarea
            rows={1}
            placeholder="Type your message..."
            className={`w-full rounded-2xl border px-4 py-3 placeholder:text-gray-500 resize-none overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md focus:outline-none focus:ring-2 ${
              darkMode
                ? "bg-gray-800 text-white border-gray-700 focus:ring-gray-600"
                : "bg-white/80 backdrop-blur-md text-gray-900 border-gray-300 focus:ring-gray-400"
            }`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = target.scrollHeight + "px";
            }}
          />
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className={`flex-shrink-0 px-5 py-3 rounded-2xl font-semibold shadow-md hover:shadow-lg transition-all duration-300 disabled:opacity-50 ${
            darkMode
              ? "text-white bg-gradient-to-r from-gray-700 to-black"
              : "text-white bg-gradient-to-r from-gray-800 to-black"
          }`}
        >
          Send
        </motion.button>
      </div>
    </div>
  );
}
