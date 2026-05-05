import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../server/api';
import './footer.css';

const Footer = ({ user }) => {
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user) {
      setStatusMessage('Debes iniciar sesión para enviar un comentario.');
      return;
    }

    const text = comment.trim();
    if (!text) {
      setStatusMessage('Escribe tu comentario antes de enviar.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('');

    try {
      await addDoc(collection(db, 'COMENTARIOS'), {
        userId: user.uid,
        email: user.email || '',
        comment: text,
        createdAt: serverTimestamp(),
      });

      setComment('');
      setStatusMessage('Gracias por tu comentario. Se ha enviado correctamente.');
    } catch (error) {
      console.error('Error guardando comentario:', error);
      setStatusMessage('No se pudo enviar el comentario. Intenta de nuevo más tarde.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <footer className="footer">
      <div className="footer-content">
        <h3>Déjanos tu comentario, duda o mejora futura</h3>
        <form className="footer-form" onSubmit={handleSubmit}>
          <input
            className="footer-input"
            type="text"
            placeholder="Escribe tu comentario aquí..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isSubmitting}
          />
          <button className="footer-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Enviando...' : 'Enviar comentario'}
          </button>
        </form>
        {statusMessage && <p className="footer-status">{statusMessage}</p>}
      </div>
    </footer>
  );
};

export default Footer;
