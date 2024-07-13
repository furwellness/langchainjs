import { test } from "@jest/globals";
import { ChatPromptTemplate } from "../../prompts/chat.js";
import {
  HumanMessage,
  AIMessage,
  ToolMessage,
  ToolMessageChunk,
} from "../index.js";
import { load } from "../../load/index.js";

test("Test ChatPromptTemplate can format OpenAI content image messages", async () => {
  const message = new HumanMessage({
    content: [
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,{image_string}`,
        },
      },
    ],
  });
  const prompt = ChatPromptTemplate.fromMessages([
    message,
    ["ai", "Will this format with multiple messages?: {yes_or_no}"],
  ]);
  const formatted = await prompt.invoke({
    image_string: "base_64_encoded_string",
    yes_or_no: "YES!",
  });
  expect(formatted.messages[0].content[0]).toEqual({
    type: "image_url",
    image_url: {
      url: "data:image/jpeg;base64,base_64_encoded_string",
    },
  });
  expect(formatted.messages[1].content).toEqual(
    "Will this format with multiple messages?: YES!"
  );
});

test("Test ChatPromptTemplate can format OpenAI content image messages", async () => {
  const message = new HumanMessage({
    content: [
      {
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,{image_string}`,
        },
      },
    ],
  });
  const prompt = ChatPromptTemplate.fromMessages([
    message,
    ["ai", "Will this format with multiple messages?: {yes_or_no}"],
  ]);
  const formatted = await prompt.invoke({
    image_string: "base_64_encoded_string",
    yes_or_no: "YES!",
  });
  expect(formatted.messages[0].content[0]).toEqual({
    type: "image_url",
    image_url: {
      url: "data:image/jpeg;base64,base_64_encoded_string",
    },
  });
  expect(formatted.messages[1].content).toEqual(
    "Will this format with multiple messages?: YES!"
  );
});

test("Deserialisation and serialisation of additional_kwargs and tool_call_id", async () => {
  const config = {
    importMap: { messages: { AIMessage } },
    optionalImportEntrypoints: [],
    optionalImportsMap: {},
    secretsMap: {},
  };

  const message = new AIMessage({
    content: "",
    additional_kwargs: {
      tool_calls: [
        {
          id: "call_tXJNP1S6LHT5tLfaNHCbYCtH",
          type: "function" as const,
          function: {
            name: "Weather",
            arguments: '{\n  "location": "Prague"\n}',
          },
        },
      ],
    },
  });

  const deserialized: AIMessage = await load(JSON.stringify(message), config);
  expect(deserialized).toEqual(message);
});

test("Deserialisation and serialisation of tool_call_id", async () => {
  const config = {
    importMap: { messages: { ToolMessage } },
    optionalImportEntrypoints: [],
    optionalImportsMap: {},
    secretsMap: {},
  };

  const message = new ToolMessage({
    content: '{"value": 32}',
    tool_call_id: "call_tXJNP1S6LHT5tLfaNHCbYCtH",
  });

  const deserialized: ToolMessage = await load(JSON.stringify(message), config);
  expect(deserialized).toEqual(message);
});

test("Deserialisation and serialisation of messages with ID", async () => {
  const config = {
    importMap: { messages: { AIMessage } },
    optionalImportEntrypoints: [],
    optionalImportsMap: {},
    secretsMap: {},
  };

  const messageId = "uuid-1234";

  const message = new AIMessage({
    content: "The sky is blue because...",
    id: messageId,
  });

  const deserialized: AIMessage = await load(JSON.stringify(message), config);
  expect(deserialized).toEqual(message);
  expect(deserialized.id).toBe(messageId);
});

test("Can concat artifact (string) of ToolMessageChunk", () => {
  const rawOutputOne = "Hello";
  const rawOutputTwo = " world";
  const chunk1 = new ToolMessageChunk({
    content: "Hello",
    tool_call_id: "1",
    artifact: rawOutputOne,
  });
  const chunk2 = new ToolMessageChunk({
    content: " world",
    tool_call_id: "1",
    artifact: rawOutputTwo,
  });

  const concated = chunk1.concat(chunk2);
  expect(concated.artifact).toBe(`${rawOutputOne}${rawOutputTwo}`);
});

test("Can concat artifact (array) of ToolMessageChunk", () => {
  const rawOutputOne = ["Hello", " world"];
  const rawOutputTwo = ["!!"];
  const chunk1 = new ToolMessageChunk({
    content: "Hello",
    tool_call_id: "1",
    artifact: rawOutputOne,
  });
  const chunk2 = new ToolMessageChunk({
    content: " world",
    tool_call_id: "1",
    artifact: rawOutputTwo,
  });

  const concated = chunk1.concat(chunk2);
  expect(concated.artifact).toEqual(["Hello", " world", "!!"]);
});

test("Can concat artifact (object) of ToolMessageChunk", () => {
  const rawOutputOne = {
    foo: "bar",
  };
  const rawOutputTwo = {
    bar: "baz",
  };
  const chunk1 = new ToolMessageChunk({
    content: "Hello",
    tool_call_id: "1",
    artifact: rawOutputOne,
  });
  const chunk2 = new ToolMessageChunk({
    content: " world",
    tool_call_id: "1",
    artifact: rawOutputTwo,
  });

  const concated = chunk1.concat(chunk2);
  expect(concated.artifact).toEqual({
    foo: "bar",
    bar: "baz",
  });
});
