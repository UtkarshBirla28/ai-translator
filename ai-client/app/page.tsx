"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  id: number;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "image";
  image?: string;
};

const languages = [
  "English",
  "French",
  "Hindi",
  "Italian",
];

type Mode =
  | "translate"
  | "correct"
  | "correct-translate";

export default function Home() {
  const [message, setMessage] = useState("");
  const [language, setLanguage] = useState("Hindi");

  const [messages, setMessages] = useState<Message[]>([]);

  const [loading, setLoading] = useState(false);

  const [mode, setMode] =
    useState<Mode>("translate");

  const [webEnabled, setWebEnabled] =
    useState(false);

  const [imageMode, setImageMode] =
    useState(false);

  const bottomRef =
    useRef<HTMLDivElement>(null);

  /*
  |--------------------------------------------------------------------------
  | AUTO SCROLL
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  /*
  |--------------------------------------------------------------------------
  | SEND MESSAGE
  |--------------------------------------------------------------------------
  */

  const sendMessage = async () => {
    if (!message.trim() || loading) {
      return;
    }

    const userText = message.trim();

    setMessage("");

    /*
    |--------------------------------------------------------------------------
    | IMAGE GENERATION
    |--------------------------------------------------------------------------
    */

    if (imageMode) {
      await generateImage(userText);
      return;
    }

    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: userText,
    };

    const assistantId =
      Date.now() + 1;

    const assistantMessage: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    setMessages((previous) => [
      ...previous,
      userMessage,
      assistantMessage,
    ]);

    setLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/chat?language=${encodeURIComponent(
          language
        )}&web=${webEnabled}`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            message: userText,
            mode,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Request failed: ${response.status}`
        );
      }

      if (!response.body) {
        throw new Error(
          "Streaming is not supported by this response."
        );
      }

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder();

      let buffer = "";

      while (true) {
        const {
          value,
          done,
        } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(
          value,
          {
            stream: true,
          }
        );

        const events =
          buffer.split("\n\n");

        buffer =
          events.pop() || "";

        for (const event of events) {
          if (
            !event.startsWith(
              "data: "
            )
          ) {
            continue;
          }

          const data =
            event.slice(6);

          try {
            const parsed =
              JSON.parse(data);

            /*
            |--------------------------------------------------------------------------
            | TEXT CHUNK
            |--------------------------------------------------------------------------
            */

            if (
              parsed.type === "text"
            ) {
              setMessages(
                (previous) =>
                  previous.map(
                    (item) =>
                      item.id ===
                        assistantId
                        ? {
                          ...item,
                          content:
                            item.content +
                            parsed.content,
                        }
                        : item
                  )
              );
            }

            /*
            |--------------------------------------------------------------------------
            | ERROR
            |--------------------------------------------------------------------------
            */

            if (
              parsed.type ===
              "error"
            ) {
              throw new Error(
                parsed.error
              );
            }
          } catch (error) {
            console.error(
              "Stream parsing error:",
              error
            );
          }
        }
      }
    } catch (error) {
      console.error(error);

      setMessages(
        (previous) =>
          previous.map(
            (item) =>
              item.id ===
                assistantId
                ? {
                  ...item,
                  content:
                    error instanceof
                      Error
                      ? `Error: ${error.message}`
                      : "Something went wrong.",
                }
                : item
          )
      );
    } finally {
      setLoading(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | IMAGE GENERATION
  |--------------------------------------------------------------------------
  */

  const generateImage = async (
    prompt: string
  ) => {
    const userMessage: Message = {
      id: Date.now(),
      role: "user",
      content: prompt,
    };

    setMessages((previous) => [
      ...previous,
      userMessage,
    ]);

    setLoading(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/image`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            prompt,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Image generation failed."
        );
      }

      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          content:
            "Generated image",
          type: "image",
          image: data.image,
        },
      ]);
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        {
          id: Date.now() + 1,
          role: "assistant",
          content:
            error instanceof Error
              ? `Error: ${error.message}`
              : "Image generation failed.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  /*
  |--------------------------------------------------------------------------
  | CLEAR CHAT
  |--------------------------------------------------------------------------
  */

  const clearChat = () => {
    if (loading) {
      return;
    }

    setMessages([]);
  };

  /*
  |--------------------------------------------------------------------------
  | KEYBOARD
  |--------------------------------------------------------------------------
  */

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      event.key === "Enter" &&
      (event.ctrlKey ||
        event.metaKey)
    ) {
      event.preventDefault();

      sendMessage();
    }
  };

  /*
  |--------------------------------------------------------------------------
  | CURRENT MODE LABEL
  |--------------------------------------------------------------------------
  */

  const getModeLabel = () => {
    if (imageMode) {
      return "Image generation";
    }

    if (mode === "correct") {
      return "Correction";
    }

    if (
      mode === "correct-translate"
    ) {
      return "Correction + translation";
    }

    return `Translation → ${language}`;
  };

  return (
    <main className="min-h-screen bg-[#f7f7f8] text-zinc-900">

      {/* HEADER */}

      <header className="border-b border-zinc-200 bg-white">

        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-sm font-bold text-white">
              AI
            </div>

            <div>
              <h1 className="font-semibold">
                AI Translator
              </h1>

              <p className="text-xs text-zinc-400">
                Translate · Correct · Search · Create
              </p>
            </div>

          </div>

          <button
            onClick={clearChat}
            disabled={
              loading ||
              messages.length === 0
            }
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear chat
          </button>

        </div>

      </header>

      {/* MAIN */}

      <div className="mx-auto flex min-h-[calc(100vh-73px)] max-w-6xl flex-col px-4 py-6 sm:px-6">

        {/* CHAT */}

        <section className="flex flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-[0_20px_60px_-20px_rgba(0,0,0,0.12)]">

          {/* CHAT HEADER */}

          <div className="border-b border-zinc-100 px-5 py-4">

            <div className="flex items-center justify-between">

              <div>

                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  AI Translator
                </p>

                <h2 className="mt-1 text-lg font-semibold">
                  {getModeLabel()}
                </h2>

              </div>

              {loading && (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-600">

                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />

                  Streaming

                </div>
              )}

            </div>

          </div>

          {/* MESSAGES */}

          <div className="flex-1 overflow-y-auto">

            <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-5 py-7">

              {/* EMPTY STATE */}

              {messages.length === 0 && (

                <div className="flex min-h-[45vh] flex-col items-center justify-center text-center">

                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-950 text-xl font-bold text-white">
                    AI
                  </div>

                  <h2 className="mt-6 text-3xl font-semibold tracking-tight">
                    Translate anything.
                  </h2>

                  <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-500">
                    Translate text, correct mistakes,
                    search the web, or generate
                    images using AI.
                  </p>

                  <div className="mt-7 flex flex-wrap justify-center gap-2">

                    {languages.map(
                      (item) => (
                        <button
                          key={item}
                          onClick={() =>
                            setLanguage(
                              item
                            )
                          }
                          className={`rounded-full border px-4 py-2 text-sm transition ${language ===
                            item
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                            }`}
                        >
                          {item}
                        </button>
                      )
                    )}

                  </div>

                </div>
              )}

              {/* MESSAGE LIST */}

              {messages.map(
                (item) => (

                  <div
                    key={item.id}
                    className={`flex ${item.role ===
                      "user"
                      ? "justify-end"
                      : "justify-start"
                      }`}
                  >

                    <div
                      className={
                        item.role ===
                          "user"
                          ? "max-w-[80%] rounded-2xl rounded-br-md bg-zinc-950 px-5 py-3.5 text-white"
                          : "w-full max-w-3xl"
                      }
                    >

                      {/* ASSISTANT LABEL */}

                      {item.role ===
                        "assistant" && (
                          <div className="mb-3 flex items-center gap-2">

                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-950 text-[10px] font-bold text-white">
                              AI
                            </div>

                            <span className="text-xs font-semibold text-zinc-400">
                              AI Translator
                            </span>

                          </div>
                        )}

                      {/* IMAGE */}

                      {item.type ===
                        "image" ? (

                        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">

                          {item.image && (
                            <img
                              src={
                                item.image
                              }
                              alt="AI generated image"
                              className="w-full"
                            />
                          )}

                          <div className="border-t border-zinc-100 px-4 py-3 text-xs text-zinc-400">
                            AI generated image
                          </div>

                        </div>

                      ) : (

                        <div
                          className={`whitespace-pre-wrap text-[15px] leading-7 ${item.role ===
                            "user"
                            ? "text-white"
                            : "text-zinc-800"
                            }`}
                        >
                          {item.content}

                          {loading &&
                            item.role ===
                            "assistant" &&
                            item.id ===
                            messages[
                              messages.length -
                              1
                            ]?.id && (
                              <span className="ml-1 inline-block h-4 w-1 animate-pulse bg-zinc-400 align-middle" />
                            )}
                        </div>

                      )}

                      {/* COPY */}

                      {item.role ===
                        "assistant" &&
                        item.content &&
                        item.type !==
                        "image" && (

                          <button
                            onClick={() =>
                              navigator.clipboard.writeText(
                                item.content
                              )
                            }
                            className="mt-3 rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                          >
                            Copy
                          </button>

                        )}

                    </div>

                  </div>

                )
              )}

              {/* THINKING */}

              {loading &&
                messages[
                  messages.length -
                  1
                ]?.role ===
                "user" && (

                  <div className="flex items-center gap-3 text-sm text-zinc-400">

                    <div className="flex gap-1">

                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" />

                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />

                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />

                    </div>

                    AI is thinking...

                  </div>
                )}

              <div ref={bottomRef} />

            </div>

          </div>

          {/* COMPOSER */}

          <div className="border-t border-zinc-200 bg-white">

            <div className="mx-auto max-w-4xl px-5 py-4">

              {/* TOOLS */}

              <div className="mb-3 flex flex-wrap gap-2">

                {/* LANGUAGE */}

                <select
                  value={language}
                  onChange={(event) =>
                    setLanguage(
                      event.target.value
                    )
                  }
                  disabled={loading}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium outline-none focus:border-zinc-500"
                >
                  {languages.map(
                    (item) => (
                      <option
                        key={item}
                        value={item}
                      >
                        {item}
                      </option>
                    )
                  )}
                </select>

                {/* TRANSLATE */}

                <button
                  onClick={() => {
                    setMode(
                      "translate"
                    );
                    setImageMode(
                      false
                    );
                  }}
                  disabled={loading}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode ===
                    "translate" &&
                    !imageMode
                    ? "bg-zinc-950 text-white"
                    : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                >
                  Translate
                </button>

                {/* CORRECT */}

                <button
                  onClick={() => {
                    setMode(
                      "correct"
                    );
                    setImageMode(
                      false
                    );
                  }}
                  disabled={loading}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode ===
                    "correct" &&
                    !imageMode
                    ? "bg-zinc-950 text-white"
                    : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                >
                  ✨ Correct
                </button>

                {/* CORRECT + TRANSLATE */}

                <button
                  onClick={() => {
                    setMode(
                      "correct-translate"
                    );
                    setImageMode(
                      false
                    );
                  }}
                  disabled={loading}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${mode ===
                    "correct-translate" &&
                    !imageMode
                    ? "bg-zinc-950 text-white"
                    : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                >
                  Correct + Translate
                </button>

                {/* WEB */}

                <button
                  onClick={() =>
                    setWebEnabled(
                      (previous) =>
                        !previous
                    )
                  }
                  disabled={loading}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${webEnabled
                    ? "bg-emerald-600 text-white"
                    : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                >
                  🌐 Web
                </button>

                {/* IMAGE */}

                <button
                  onClick={() =>
                    setImageMode(
                      (previous) =>
                        !previous
                    )
                  }
                  disabled={loading}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${imageMode
                    ? "bg-purple-600 text-white"
                    : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                >
                  🎨 Image
                </button>

              </div>

              {/* INPUT */}

              <div className="relative rounded-2xl border border-zinc-300 bg-white shadow-sm transition focus-within:border-zinc-500 focus-within:shadow-md">

                <textarea
                  value={message}
                  onChange={(event) =>
                    setMessage(
                      event.target.value
                    )
                  }
                  onKeyDown={
                    handleKeyDown
                  }
                  disabled={loading}
                  rows={3}
                  placeholder={
                    imageMode
                      ? "Describe the image you want to generate..."
                      : mode ===
                        "correct"
                        ? "Enter text you want to correct..."
                        : mode ===
                          "correct-translate"
                          ? "Enter text to correct and translate..."
                          : `Type something to translate into ${language}...`
                  }
                  className="w-full resize-none bg-transparent px-4 py-4 pr-16 text-[15px] leading-7 outline-none placeholder:text-zinc-400"
                />

                {/* SEND */}

                <button
                  onClick={
                    sendMessage
                  }
                  disabled={
                    !message.trim() ||
                    loading
                  }
                  className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-lg text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
                >
                  ↑
                </button>

              </div>

              {/* STATUS */}

              <div className="mt-2 flex items-center justify-between text-xs text-zinc-400">

                <span>
                  {getModeLabel()}
                  {webEnabled &&
                    !imageMode &&
                    " · Web enabled"}
                </span>

                <span>
                  Ctrl + Enter
                </span>

              </div>

            </div>

          </div>

        </section>

        {/* FOOTER */}

        <footer className="py-4 text-center text-xs text-zinc-400">
          Powered by AI · Responses stream in real time
        </footer>

      </div>

    </main>
  );
}
