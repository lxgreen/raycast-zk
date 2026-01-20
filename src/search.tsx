import { useState, useEffect } from "react";
import { List, ActionPanel, Action, Icon, showToast, Toast, Detail } from "@raycast/api";
import { searchNotes, listNotes, openNote, getNoteContent, ZKNote } from "./lib/zk";
import { usePromise } from "@raycast/utils";

export default function SearchNotes() {
  const [searchText, setSearchText] = useState("");
  const [selectedNote, setSelectedNote] = useState<ZKNote | null>(null);

  const { data: notes, isLoading, revalidate } = usePromise(
    async (query: string) => {
      if (query.trim()) {
        return await searchNotes(query);
      } else {
        return await listNotes();
      }
    },
    [searchText],
    {
      onError: async (error) => {
        await showToast({
          style: Toast.Style.Failure,
          title: "Error searching notes",
          message: error.message,
        });
      },
    }
  );

  const handleOpenNote = async (note: ZKNote) => {
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Opening note...",
      });
      await openNote(note.path);
      await showToast({
        style: Toast.Style.Success,
        title: "Note opened",
      });
    } catch (error: any) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error opening note",
        message: error.message,
      });
    }
  };

  const handleShowPreview = async (note: ZKNote) => {
    setSelectedNote(note);
  };

  if (selectedNote) {
    return <NotePreview note={selectedNote} onBack={() => setSelectedNote(null)} />;
  }

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search notes or #tag..."
      onSearchTextChange={setSearchText}
      throttle
      filtering={false}
    >
      {notes && notes.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.MagnifyingGlass}
          title="No notes found"
          description={searchText ? `No notes match "${searchText}"` : "Start typing to search"}
        />
      ) : (
        notes?.map((note) => (
          <List.Item
            key={note.id}
            icon={Icon.Document}
            title={note.title}
            subtitle={note.path}
            accessories={[
              {
                icon: Icon.ArrowRight,
                tooltip: "Press Enter to open",
              },
            ]}
            actions={
              <ActionPanel>
                <Action
                  icon={Icon.Eye}
                  title="Preview Note"
                  onAction={() => handleShowPreview(note)}
                />
                <Action
                  icon={Icon.ArrowRight}
                  title="Open in Editor"
                  onAction={() => handleOpenNote(note)}
                  shortcut={{ modifiers: ["cmd"], key: "return" }}
                />
                <Action.CopyToClipboard
                  icon={Icon.Clipboard}
                  title="Copy Path"
                  content={note.path}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
                <Action.CopyToClipboard
                  icon={Icon.Clipboard}
                  title="Copy Title"
                  content={note.title}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

function NotePreview({ note, onBack }: { note: ZKNote; onBack: () => void }) {
  const { data: content, isLoading } = usePromise(() => getNoteContent(note.path), []);

  return (
    <Detail
      isLoading={isLoading}
      markdown={content || "Loading..."}
      navigationTitle={note.title}
      actions={
        <ActionPanel>
          <Action
            icon={Icon.ArrowRight}
            title="Open Note"
            onAction={async () => {
              await openNote(note.path);
              onBack();
            }}
          />
          <Action
            icon={Icon.ArrowLeft}
            title="Back to Search"
            onAction={onBack}
            shortcut={{ modifiers: ["cmd"], key: "b" }}
          />
          <Action.CopyToClipboard
            icon={Icon.Clipboard}
            title="Copy Path"
            content={note.path}
          />
        </ActionPanel>
      }
    />
  );
}
