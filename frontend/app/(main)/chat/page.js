import Header from '@/_Pages/main/layouts/Header/Header';
import Sidebar from '@/_Pages/main/layouts/headerLateralIzquierdo';
import ChatClient from '@/_Pages/main/Chat/chat.js';
import styles from '@/app/(main)/page.module.css';

export const metadata = {
  title: 'Chats',
  description: 'Tus conversaciones en pikante pe',
  alternates: { canonical: '/chat' },
  robots: { index: false, follow: false },
};

export default function ChatPage() {
  return (
    <div className={styles.layout}>
      <Header />
      <div className={styles.body}>
        <Sidebar />
        <ChatClient />
      </div>
    </div>
  );
}
