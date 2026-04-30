import React, { useState } from 'react';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../server/api';
import { showToast } from '../../ToastContainer';
import './compartirhorario.css';

const CompartirHorario = ({ user, onClose, isOpen, sharedWith, onShareUpdated }) => {
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSearchResult, setSelectedSearchResult] = useState(null);

  const handleSearchUser = async () => {
    if (!searchEmail.trim()) {
      showToast('Por favor ingresa un correo electrónico.', 'warning');
      return;
    }

    setIsSearching(true);
    try {
      const q = query(collection(db, 'usuarios'), where('email', '==', searchEmail.trim().toLowerCase()));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        showToast('Usuario no encontrado.', 'info');
        setSearchResults([]);
      } else {
        const results = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          email: doc.data().email,
          name: doc.data().name || 'Sin nombre',
        }));
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Error buscando usuario:', error);
      showToast('Error al buscar usuario.', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectUser = (result) => {
    setSelectedSearchResult(result);
  };

  const handleAcceptShare = async () => {
    if (!selectedSearchResult) {
      showToast('Por favor selecciona un usuario.', 'warning');
      return;
    }

    if (sharedWith.includes(selectedSearchResult.email)) {
      showToast('Este usuario ya está en la lista de compartidos.', 'info');
      return;
    }

    if (!user) {
      showToast('No se encontró usuario activo.', 'error');
      return;
    }

    try {
      const updatedSharedWith = [...sharedWith, selectedSearchResult.email];
      await setDoc(
        doc(db, 'HORARIOS', user.uid),
        {
          sharedWith: updatedSharedWith,
        },
        { merge: true }
      );

      showToast(`Horario compartido con ${selectedSearchResult.name}.`, 'success');
      onShareUpdated(updatedSharedWith);
      handleClose();
    } catch (error) {
      console.error('Error compartiendo horario:', error);
      showToast('No se pudo compartir el horario.', 'error');
    }
  };

  const handleRemoveSharedUser = async (email) => {
    if (!user) {
      showToast('No se encontró usuario activo.', 'error');
      return;
    }

    try {
      const updatedSharedWith = sharedWith.filter((e) => e !== email);
      await setDoc(
        doc(db, 'HORARIOS', user.uid),
        {
          sharedWith: updatedSharedWith,
        },
        { merge: true }
      );

      showToast('Usuario removido de compartidos.', 'success');
      onShareUpdated(updatedSharedWith);
    } catch (error) {
      console.error('Error removiendo usuario compartido:', error);
      showToast('No se pudo remover el usuario.', 'error');
    }
  };

  const handleClose = () => {
    setSearchEmail('');
    setSearchResults([]);
    setSelectedSearchResult(null);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <>
      <div className="compartir-overlay" onClick={handleClose} />
      <div className="compartir-modal">
        <div className="compartir-modal-header">
          <h3>Compartir horario</h3>
          <button type="button" className="compartir-modal-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        <div className="compartir-modal-content">
          <div className="compartir-search-section">
            <label htmlFor="userEmailSearch">Buscar usuario por correo</label>
            <div className="compartir-search-input-wrapper">
              <input
                id="userEmailSearch"
                type="email"
                placeholder="ejemplo@correo.com"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearchUser()}
              />
              <button
                type="button"
                className="compartir-search-button"
                onClick={handleSearchUser}
                disabled={isSearching}
              >
                {isSearching ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="compartir-search-results">
              <p className="compartir-results-title">Resultados:</p>
              <div className="compartir-results-list">
                {searchResults.map((result) => (
                  <div
                    key={result.id}
                    className={`compartir-result-item ${selectedSearchResult?.id === result.id ? 'selected' : ''}`}
                    onClick={() => handleSelectUser(result)}
                  >
                    <div className="compartir-result-content">
                      <div className="compartir-result-name">{result.name}</div>
                      <div className="compartir-result-email">{result.email}</div>
                    </div>
                    <input
                      type="radio"
                      name="sharedUser"
                      checked={selectedSearchResult?.id === result.id}
                      onChange={() => handleSelectUser(result)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {sharedWith.length > 0 && (
            <div className="compartir-shared-list">
              <h4>Compartido con:</h4>
              <ul>
                {sharedWith.map((email) => (
                  <li key={email} className="compartir-shared-item">
                    <span>{email}</span>
                    <button
                      type="button"
                      className="compartir-remove-share-btn"
                      onClick={() => handleRemoveSharedUser(email)}
                      title="Remover acceso"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="compartir-modal-footer">
          <button type="button" className="compartir-modal-cancel" onClick={handleClose}>
            Cancelar
          </button>
          <button type="button" className="compartir-modal-accept" onClick={handleAcceptShare}>
            Aceptar
          </button>
        </div>
      </div>
    </>
  );
};

export default CompartirHorario;
