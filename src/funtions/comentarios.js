import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, serverTimestamp, updateDoc } from 'firebase/firestore';
import { FiX, FiInfo, FiInbox } from 'react-icons/fi';
import { auth, db } from '../components/server/api';
import { showToast } from '../components/ToastContainer';
import './comentarios.css';

const ADMIN_EMAIL = 'jocheangel728@gmail.com';

const isAdminUser = (user) =>
  user?.rol === 'admin' || user?.role === 'admin' || user?.email === ADMIN_EMAIL;

const parseDateValue = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
};

const formatDate = (value) => {
  const date = parseDateValue(value);
  if (!date || Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const ComentariosModal = ({ isOpen, onClose, user }) => {
  const actualUser = user || auth.currentUser;
  const [comments, setComments] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingValues, setEditingValues] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen || !isAdminUser(actualUser)) return;

    const loadComments = async () => {
      setError(null);
      setIsLoading(true);
      try {
        const querySnapshot = await getDocs(collection(db, 'COMENTARIOS'));
        const fetchedComments = [];
        querySnapshot.forEach((doc) => {
          fetchedComments.push({ id: doc.id, ...doc.data() });
        });
        fetchedComments.sort((a, b) => {
          const dateA = parseDateValue(a.createdAt) || new Date(0);
          const dateB = parseDateValue(b.createdAt) || new Date(0);
          return dateB - dateA;
        });
        setComments(fetchedComments);
      } catch (err) {
        console.error('Error cargando comentarios:', err);
        setError('No se pudieron cargar los comentarios. Intenta de nuevo.');
      } finally {
        setIsLoading(false);
      }
    };

    loadComments();
  }, [isOpen, actualUser]);

  if (!isOpen || !isAdminUser(actualUser)) return null;

  const handleFieldChange = (commentId, field, value) => {
    setEditingValues((prev) => ({
      ...prev,
      [commentId]: {
        ...prev[commentId],
        [field]: value,
      },
    }));
  };

  const filteredComments = comments.filter((comment) => {
    const normalizedStatus = (comment.status || 'nuevo').toString().toLowerCase();
    if (statusFilter === 'all') return true;
    return normalizedStatus === statusFilter;
  });

  const getEditedValue = (commentId, field, fallback) =>
    editingValues[commentId]?.[field] ?? fallback;

  const commentHasChanges = (comment) => {
    const currentStatus = comment.status || 'nuevo';
    const currentObservation = comment.observation || '';
    const changes = editingValues[comment.id];
    return !!changes && (
      changes.status !== currentStatus ||
      changes.observation !== currentObservation
    );
  };

  const saveCommentChanges = async (comment) => {
    const changes = editingValues[comment.id];
    if (!changes) return;

    const updatedStatus = changes.status || comment.status || 'nuevo';
    const updatedObservation = changes.observation ?? comment.observation ?? '';

    try {
      await updateDoc(doc(db, 'COMENTARIOS', comment.id), {
        status: updatedStatus,
        observation: updatedObservation,
        updatedAt: serverTimestamp(),
      });

      showToast('Cambios guardados', 'success');

      setComments((prev) =>
        prev.map((item) =>
          item.id === comment.id ? { ...item, status: updatedStatus, observation: updatedObservation } : item
        )
      );
      setEditingValues((prev) => {
        const next = { ...prev };
        delete next[comment.id];
        return next;
      });
    } catch (err) {
      console.error('Error guardando cambios de comentario:', err);
      setError('No se pudieron guardar los cambios. Intenta nuevamente.');
      showToast('Error al guardar cambios', 'error');
    }
  };

  return (
    <div className="comentarios-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="comentarios-modal-content">
        <div className="comentarios-modal-header">
          <div className="comentarios-modal-title">
            <FiInbox size={20} />
            <div>
              <h2>Solicitudes de Comentarios</h2>
              <p>Revisa estados y observaciones de los comentarios recibidos.</p>
            </div>
          </div>
          <button className="comentarios-close-button" onClick={onClose} aria-label="Cerrar">
            <FiX size={18} />
          </button>
        </div>

        <div className="comentarios-modal-body">
          <div className="comentarios-filter-bar">
            {[
              { key: 'all', label: 'Todos' },
              { key: 'nuevo', label: 'Nuevo' },
              { key: 'en proceso', label: 'En proceso' },
              { key: 'finalizado', label: 'Finalizado' },
            ].map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`comentarios-filter-button ${statusFilter === filter.key ? 'active' : ''}`}
                onClick={() => setStatusFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {isLoading ? (
            <div className="comentarios-loading">Cargando comentarios…</div>
          ) : error ? (
            <div className="comentarios-error">{error}</div>
          ) : comments.length === 0 ? (
            <div className="comentarios-empty">No hay comentarios registrados.</div>
          ) : filteredComments.length === 0 ? (
            <div className="comentarios-empty">No hay comentarios para este filtro.</div>
          ) : (
            <div className="comentarios-list">
              {filteredComments.map((comment) => {
                const currentStatus = getEditedValue(comment.id, 'status', comment.status || 'nuevo');
                const currentObservation = getEditedValue(comment.id, 'observation', comment.observation || '');
                const changesPending = commentHasChanges(comment);

                return (
                  <div key={comment.id} className="comentario-card">
                    <div className="comentario-card-header">
                      <div>
                        <span className="comentario-email">{comment.email || 'Sin email'}</span>
                        <span className={`comentario-status ${currentStatus === 'finalizado' ? 'finalizado' : currentStatus === 'en proceso' ? 'proceso' : 'nuevo'}`}>
                          {currentStatus}
                        </span>
                      </div>
                      <span className="comentario-date">{formatDate(comment.createdAt)}</span>
                    </div>

                    <div className="comentario-body">
                      <p className="comentario-text">{comment.comment}</p>

                      <div className="comentario-controls">
                        <label className="comentario-label">
                          Estado
                          <select
                            className="comentario-select"
                            value={currentStatus}
                            onChange={(e) => handleFieldChange(comment.id, 'status', e.target.value)}
                          >
                            <option value="nuevo">nuevo</option>
                            <option value="en proceso">en proceso</option>
                            <option value="finalizado">finalizado</option>
                          </select>
                        </label>

                        <label className="comentario-label comentario-textarea-label">
                          Observaciones
                          <textarea
                            className="comentario-textarea"
                            value={currentObservation}
                            onChange={(e) => handleFieldChange(comment.id, 'observation', e.target.value)}
                            placeholder="Agrega una observación..."
                            rows={3}
                          />
                        </label>

                        <button
                          type="button"
                          className="comentario-save-button"
                          onClick={() => saveCommentChanges(comment)}
                          disabled={!changesPending}
                        >
                          Guardar cambios
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComentariosModal;
