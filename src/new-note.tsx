import { Form, ActionPanel, Action, showToast, Toast, popToRoot } from "@raycast/api";
import { useState } from "react";
import { createNote, openNote } from "./lib/zk";

interface FormValues {
  title: string;
  tags: string;
}

export default function NewNote() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (values: FormValues) => {
    if (!values.title.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Title is required",
      });
      return;
    }

    setIsLoading(true);

    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Creating note...",
      });

      const result = await createNote({
        title: values.title.trim(),
        tags: values.tags?.trim(),
      });

      await showToast({
        style: Toast.Style.Animated,
        title: "Opening note...",
      });

      await openNote(result.path);

      await showToast({
        style: Toast.Style.Success,
        title: "Note created",
        message: result.path,
      });

      await popToRoot();
    } catch (error: any) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error creating note",
        message: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Note" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="Enter note title"
        autoFocus
      />
      <Form.TextField
        id="tags"
        title="Tags"
        placeholder="tag1, tag2 (optional)"
      />
    </Form>
  );
}
