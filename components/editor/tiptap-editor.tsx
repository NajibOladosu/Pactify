"use client";

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import React from 'react';

// Define the props for the editor component
interface TiptapEditorProps {
  initialContent: any; // Tiptap content is typically JSON
  onContentChange?: (content: any) => void; // Make optional with '?'
  editable?: boolean; // To control if the editor is editable or read-only
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
  initialContent,
  onContentChange,
  editable = true, // Default to editable
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Configure extensions as needed
        // e.g., heading: { levels: [1, 2, 3] },
      }),
    ],
    content: initialContent, // Set initial content
    editable: editable, // Set editable state
    immediatelyRender: false, // Fix SSR hydration issues
    onUpdate: ({ editor }) => {
      // Only call onContentChange if it's provided (i.e., in editable mode)
      if (editable && onContentChange) {
        onContentChange(editor.getJSON());
      }
    },
  });

  if (!editor) {
    return null; // Or a loading indicator
  }

  return (
    <div className={`tiptap-editor ${!editable ? 'read-only' : ''} border rounded-md`}>
      {editable && (
        <div className="toolbar flex flex-wrap gap-1 p-2 border-b bg-muted/50">
          {/* Basic Toolbar Placeholder - Can be expanded */}
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={`p-1 rounded ${editor.isActive('bold') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
            aria-label="Toggle bold"
          >
            Bold
          </button>
          <button
             type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={`p-1 rounded ${editor.isActive('italic') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
             aria-label="Toggle italic"
          >
            Italic
          </button>
          <button
             type="button"
            onClick={() => editor.chain().focus().setParagraph().run()}
            className={`p-1 rounded ${editor.isActive('paragraph') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
             aria-label="Set paragraph"
          >
            Paragraph
          </button>
           <button
             type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`p-1 rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
             aria-label="Toggle H2"
          >
            H2
          </button>
           <button
             type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`p-1 rounded ${editor.isActive('heading', { level: 3 }) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
             aria-label="Toggle H3"
          >
            H3
          </button>
          <button
             type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`p-1 rounded ${editor.isActive('bulletList') ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
             aria-label="Toggle bullet list"
          >
            List
          </button>
          {/* Add more buttons as needed (Undo, Redo, etc.) */}
        </div>
      )}
      <EditorContent editor={editor} className="p-4 min-h-[200px] focus:outline-none" />
    </div>
  );
};

export default TiptapEditor;
