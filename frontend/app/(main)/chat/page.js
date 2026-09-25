import { Suspense } from 'react';
import ChatClient from '@/_Pages/main/Chat/chat.js';

export const metadata = {
  title: 'Chats',
  description: 'Tus conversaciones en pikante pe',
  alternates: { canonical: '/chat' },
  robots: { index: false, follow: false },
};

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatClient />
    </Suspense>
  );
}
