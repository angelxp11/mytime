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

const sortCargosByLevel = (cargos) =>
  [...cargos].sort((a, b) => (a.nivel || 0) - (b.nivel || 0));

const ModalGrupo = ({ isOpen, onClose, onSave, group, isSaving }) => {
  const [groupName, setGroupName] = useState('');
  const [participants, setParticipants] = useState([]);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSearchResult, setSelectedSearchResult] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [cargos, setCargos] = useState([]);
  const [newCargoName, setNewCargoName] = useState('');
  const [newCargoLevel, setNewCargoLevel] = useState(1);
  const [activeTab, setActiveTab] = useState('participants');
  const [expandedCargos, setExpandedCargos] = useState({});

  useEffect(() => {
    if (!isOpen) return;

    if (group) {
      setGroupName(group.groupName || '');
      setParticipants(group.participants || []);
      setCargos(sortCargosByLevel(group.cargos || []));
    } else {
      setGroupName('');
      setParticipants([]);
      setCargos([]);
    }
    setSearchEmail('');
    setSearchResults([]);
    setSelectedSearchResult(null);
    setIsSearching(false);
    setNewCargoName('');
    setNewCargoLevel(1);
  }, [group, isOpen]);

  const toggleCargoExpansion = (cargoId) =>
    setExpandedCargos((prev) => ({ ...prev, [cargoId]: !prev[cargoId] }));

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

  const handleAddCargo = () => {
    if (!newCargoName.trim()) return;
    
    const newCargo = {
      id: Date.now().toString(),
      nombre: newCargoName.trim(),
      nivel: parseInt(newCargoLevel),
    };
    
    setCargos([...cargos, newCargo].sort((a, b) => a.nivel - b.nivel));
    setNewCargoName('');
    setNewCargoLevel(1);
  };

  const handleRemoveCargo = (cargoId) => {
    setCargos(cargos.filter((cargo) => cargo.id !== cargoId));
    setParticipants((prev) =>
      prev.map((participant) =>
        participant.cargo === cargoId ? { ...participant, cargo: null } : participant
      )
    );
  };

  const handleChangeParticipantCargo = (index, cargoId) => {
    setParticipants((prev) =>
      prev.map((participant, idx) =>
        idx === index ? { ...participant, cargo: cargoId || null } : participant
      )
    );
  };

  const handleSave = () => {
    if (!groupName.trim()) return;

    onSave({
      groupName: groupName.trim(),
      participants,
      cargos: sortCargosByLevel(cargos),
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
          <div className="group-name-field">
            <label>
              Nombre del grupo
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Nombre del grupo"
              />
            </label>
          </div>

          <div className="modal-tabs">
            <button
              type="button"
              className={`modal-tab ${activeTab === 'participants' ? 'active' : ''}`}
              onClick={() => setActiveTab('participants')}
            >
              Buscar participantes
            </button>
            <button
              type="button"
              className={`modal-tab ${activeTab === 'cargos' ? 'active' : ''}`}
              onClick={() => setActiveTab('cargos')}
            >
              Cargos
            </button>
          </div>

          {activeTab === 'participants' ? (
            <section className="modal-section participant-section">
              <h3>Buscar participantes</h3>
              <p className="section-description">Encuentra usuarios por correo y géralos en el listado para asignarles cargos.</p>

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
                      <div className="participant-cargo-select">
                        <label>
                          Cargo
                          <select
                            value={participant.cargo || ''}
                            onChange={(e) => handleChangeParticipantCargo(index, e.target.value)}
                          >
                            <option value="">Sin cargo</option>
                            {cargos.map((cargo) => (
                              <option key={cargo.id} value={cargo.id}>
                                {cargo.nombre}
                              </option>
                            ))}
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
          ) : (
            <section className="modal-section cargo-section">
              <h3>Cargos del grupo</h3>
              <p className="section-description">Agrega cargos y revisa qué participantes ya están asignados a cada uno.</p>

              <div className="cargo-creation">
                <label>
                  Nombre del cargo
                  <input
                    type="text"
                    value={newCargoName}
                    onChange={(e) => setNewCargoName(e.target.value)}
                    placeholder="Ej: Gerente, Supervisor, Operario"
                  />
                </label>
                <label>
                  Nivel (1=Menor, 10=Mayor)
                  <select
                    value={newCargoLevel}
                    onChange={(e) => setNewCargoLevel(e.target.value)}
                  >
                    <option value="1">1 - Menor</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                    <option value="7">7</option>
                    <option value="8">8</option>
                    <option value="9">9</option>
                    <option value="10">10 - Mayor</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="add-cargo-button"
                  onClick={handleAddCargo}
                  disabled={!newCargoName.trim()}
                >
                  + Agregar cargo
                </button>
              </div>

              {cargos.length > 0 ? (
                <div className="cargo-list">
                  {cargos.map((cargo) => {
                    const assignedParticipants = participants.filter(
                      (participant) => participant.cargo === cargo.id
                    );
                    const isExpanded = !!expandedCargos[cargo.id];

                    return (
                      <div key={cargo.id} className={`cargo-item ${isExpanded ? 'expanded' : ''}`}>
                        <button
                          type="button"
                          className="cargo-item-header"
                          onClick={() => toggleCargoExpansion(cargo.id)}
                        >
                          <div>
                            <strong>{cargo.nombre}</strong>
                            <span className="cargo-level">Nivel {cargo.nivel}</span>
                          </div>
                          <div className="cargo-meta">
                            <span>{assignedParticipants.length} participantes</span>
                            <span>{isExpanded ? '▼' : '▶'}</span>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="cargo-item-details">
                            {assignedParticipants.length > 0 ? (
                              assignedParticipants.map((participant, index) => (
                                <div
                                  key={participant.uid || `${participant.email}-${index}`}
                                  className="assigned-participant"
                                >
                                  <span>{participant.name}</span>
                                  <span>{participant.email}</span>
                                </div>
                              ))
                            ) : (
                              <p className="empty-text">No hay participantes asignados a este cargo.</p>
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          className="cargo-remove"
                          onClick={() => handleRemoveCargo(cargo.id)}
                        >
                          Eliminar cargo
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="empty-text">No hay cargos creados aun.</p>
              )}
            </section>
          )}
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
