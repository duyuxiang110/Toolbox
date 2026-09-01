const paths: Record<string, string> = {
  'image-to-pdf': 'M4 5h9l5 5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM13 5v5h5M8 14h6M8 17h4',
  ocr: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10',
  image: 'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6zM8.5 10.5l.01 0M6 17l4-4 3 3 2.5-2.5L19 17',
  'pdf-to-ppt': 'M4 5h9l5 5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM13 5v5h5M8 16v-3h2.5a1.5 1.5 0 0 1 0 3H8',
  'pdf-to-word': 'M4 5h9l5 5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM13 5v5h5M7 13l1.2 4L10 13l1.8 4L13 13',
  'word-to-image': 'M4 5h9l5 5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM13 5v5h5M7 13l1 4 1.5-3 1.5 3 1-4',
  'word-to-pdf': 'M4 5h9l5 5v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM13 5v5h5M7.5 17v-4h2a1.5 1.5 0 0 1 0 3h-2',
  split: 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M12 3v18',
  merge: 'M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4',
  video: 'M4 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7zM16 10l4-2v8l-4-2',
}

export default function ToolIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] ?? paths.image} />
    </svg>
  )
}
