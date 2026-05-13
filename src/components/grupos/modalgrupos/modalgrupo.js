import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../server/api';
import './modalgrupo.css';

const formatName = (value) =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const ModalGrupo = ({ isOpen, onClose, onSave, group, isSaving }) => {
  const [groupName, setGroupName] = useState('');
  const [participants, setParticipants] = useState([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (group) {
      setGroupName(group.groupName || '');
      setParticipants(group.participants || []);
    } else {
      setGroupName('');
      setParticipants([]);
    }
    setSearchEmail('');
    setSearchResults([]);
    setSelectedSearchResult(null);
    setIsSearching(false);
  }, [group, isOpen]);

  const handleSearchUser = async () => {
    const email = searchEmail.trim().toLowerCase();
    if (!email) return;

    setIsSearching(true);
    setSearchResults([]);
    setSelectedSearchResult(null);

    try {
      const usuariosRef = collection(db, 'usuarios');
      const searchQuery = query(usuariosRef, where('email', '==', email));
      const snapshot = await getDocs(searchQuery);
      const results = snapshot.docs.map((doc) => ({
        id: doc.id,
        email: doc.data().email,
        name: formatName(doc.data().name || 'Sin nombre'),
      }));
      setSearchResults(results);
    } catch (error) {
      console.error('Error buscando usuario por email:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result) => {
    setSelectedSearchResult(result);
  };

  const handleAddParticipant = () => {
    if (!selectedSearchResult) return;

    const alreadyExists = participants.some(
      (participant) => participant.email === selectedSearchResult.email
    );
    if (alreadyExists) {
      return;
    }

    setParticipants([
      ...participants,
      {
        name: selectedSearchResult.name,
        email: selectedSearchResult.email,
        uid: selectedSearchResult.id,
        role: 'lector',
      },
    ]);
    setSelectedSearchResult(null);
    setSearchEmail('');
    setSearchResults([]);
  };

  const handleRemoveParticipant = (index) => {
    setParticipants(participants.filter((_, idx) => idx !== index));
  };

  const handleChangeParticipantRole = (index, role) => {
    setParticipants((prev) =>
      prev.map((participant, idx) =>
        idx === index ? { ...participant, role } : participant
      )
    );
  };

  const handleSave = () => {
    if (!groupName.trim()) return;

    onSave({
      groupName: groupName.trim(),
      participants,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog">
        <button className="modal-close" onClick={onClose}>&times;</button>
        <header className="modal-header">
          <div>
            <h2>{group ? 'Editar grupo' : 'Crear grupo'}</h2>
            <p>Completa los datos y organiza los horarios del equipo.</p>
          </div>
        </header>



        <div className="modal-body">
          <section className="modal-section">
              <h3>Datos del grupo</h3>
              <label>
                Nombre del grupo
                <input
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="Nombre del grupo"
                />
              </label>

              <div className="participant-search-section">
                <label htmlFor="participantEmailSearch">Buscar participante por correo</label>
                <div className="participant-search-row">
                  <input
                    id="participantEmailSearch"
                    type="email"
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    placeholder="usuario@correo.com"
                    onKeyPress={(e) => e.key === 'Enter' && handleSearchUser()}
                  />
                  <button
                    type="button"
                    className="participant-add-button"
                    onClick={handleSearchUser}
                    disabled={isSearching}
                  >
                    {isSearching ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>

                {searchResults.length > 0 ? (
                  <div className="participant-results-list">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className={`participant-result-item ${selectedSearchResult?.id === result.id ? 'selected' : ''}`}
                        onClick={() => handleSelectSearchResult(result)}
                      >
                        <div>
                          <strong>{result.name}</strong>
                          <span>{result.email}</span>
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="participant-add-selected-button"
                      onClick={handleAddParticipant}
                      disabled={!selectedSearchResult}
                    >
                      Agregar participante
                    </button>
                  </div>
                ) : (
                  searchEmail.trim() !== '' && !isSearching && (
                    <p className="empty-text">No se encontró ningún usuario con ese correo.</p>
                  )
                )}
              </div>

              <div className="participant-list">
                {participants.length > 0 ? (
                  participants.map((participant, index) => (
                    <div key={`${participant.email}-${index}`} className="participant-row">
                      <div>
                        <strong>{participant.name}</strong>
                        <span>{participant.email}</span>
                      </div>
                      <div className="participant-role-select">
                        <label>
                          Rol
                          <select
                            value={participant.role || 'editor'}
                            onChange={(e) => handleChangeParticipantRole(index, e.target.value)}
                          >
                            <option value="lector">Lector</option>
                            <option value="editor">Editor</option>
                        
                          </select>
                        </label>
                      </div>
                      <button type="button" className="participant-remove" onClick={() => handleRemoveParticipant(index)}>
                        Eliminar
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="empty-text">No hay participantes añadidos aún.</p>
                )}
              </div>
            </section>
        </div>

        <div className="modal-actions">
          <button className="modal-button cancel-button" onClick={onClose}>
            Cancelar
          </button>
          <button className="modal-button save-button" onClick={handleSave} disabled={!groupName.trim() || isSaving}>
            {isSaving ? 'Guardando...' : group ? 'Guardar cambios' : 'Crear grupo'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalGrupo;
