import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { FiUsers, FiX } from 'react-icons/fi';
import { db } from '../components/server/api';
import './subs.css';

const SubsModal = ({ isOpen, onClose, user }) => {
  const [users, setUsers]               = useState([]);
  const [isLoading, setIsLoading]       = useState(false);
  const [editingUsers, setEditingUsers] = useState({});
  const [filter, setFilter]             = useState('all');

  useEffect(() => {
    if (isOpen && user?.email === 'jocheangel728@gmail.com') {
      fetchUsers();
    }
  }, [isOpen, user]);

  // Bloquear scroll del body
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'usuarios'));
      const usersData = [];
      querySnapshot.forEach((d) => usersData.push({ id: d.id, ...d.data() }));
      setUsers(usersData);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
    setIsLoading(false);
  };

  const handleMembershipToggle = (userId, currentValue) => {
    setEditingUsers((prev) => ({
      ...prev,
      [userId]: { ...prev[userId], membresia: !currentValue },
    }));
  };

  const handleExpirationChange = (userId, newDate) => {
    setEditingUsers((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        fechaExpiracion: newDate ? new Date(newDate).toISOString() : null,
      },
    }));
  };

  const saveUserChanges = async (userId) => {
    const changes = editingUsers[userId];
    if (!changes) return;

    if (changes.membresia === true)  changes.plan = 'premium';
    if (changes.membresia === false) changes.plan = 'free';

    try {
      await updateDoc(doc(db, 'usuarios', userId), changes);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...changes } : u)));
      setEditingUsers((prev) => {
        const s = { ...prev };
        delete s[userId];
        return s;
      });
      alert('Cambios guardados exitosamente');
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Error al guardar los cambios');
    }
  };

  const getEditedValue = (userId, field, defaultValue) =>
    editingUsers[userId]?.[field] ?? defaultValue;

  const hasChanges = (userId) => !!editingUsers[userId];

  const getPlanStatus = (userData) =>
    userData.plan || (userData.membresia ? 'premium' : 'free');

  const getPlanRequest = (userData) => userData.planRequest || null;

  const acceptPlanRequest = async (userId, planRequest, previousMonths = 0) => {
    if (!planRequest) return;
    const months = planRequest.months || 1;
    const expirationDate = new Date();
    expirationDate.setMonth(expirationDate.getMonth() + months);

    const updates = {
      plan: 'premium',
      membresia: true,
      fechaExpiracion: expirationDate.toISOString(),
      planRequest: { ...planRequest, status: 'accepted', acceptedAt: new Date().toISOString() },
      mesesComprados: previousMonths + months,
    };

    try {
      await updateDoc(doc(db, 'usuarios', userId), updates);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...updates } : u)));
      alert('Solicitud aceptada y membresía activada.');
    } catch (error) {
      console.error('Error aceptando solicitud:', error);
      alert('No se pudo aceptar la solicitud. Intenta de nuevo.');
    }
  };

  const pendingCount = users.filter(
    (u) => getPlanRequest(u)?.status === 'pending'
  ).length;

  const getFilteredUsers = () =>
    users.filter((userData) => {
      const plan = getPlanStatus(userData);
      if (filter === 'active')   return plan === 'premium';
      if (filter === 'inactive') return plan !== 'premium';
      if (filter === 'requests') return getPlanRequest(userData)?.status === 'pending';
      return true;
    });

  if (!isOpen || user?.email !== 'jocheangel728@gmail.com') return null;

  const filtered = getFilteredUsers();

  return (
    <div
      className="subs-modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="subs-modal-content">

        {/* ── Header ── */}
        <div className="subs-modal-header">
          <div className="subs-modal-header-left">
            <div className="subs-modal-icon">
              <FiUsers size={19} />
            </div>
            <div>
              <h2>Usuarios y Membresías</h2>
              <div className="subs-modal-subtitle">{users.length} usuarios registrados</div>
            </div>
          </div>
          <button className="subs-close-button" onClick={onClose} aria-label="Cerrar">
            <FiX size={17} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="subs-modal-body">
          {isLoading ? (
            <div className="subs-loading">Cargando usuarios…</div>
          ) : (
            <>
              {/* Filtros */}
              <div className="filter-section">
                <span className="filter-label">Filtrar:</span>
                <div className="filter-buttons">
                  {[
                    { key: 'all',      label: 'Todos' },
                    { key: 'active',   label: 'Premium' },
                    { key: 'inactive', label: 'Free' },
                    { key: 'requests', label: 'Solicitudes', count: pendingCount },
                  ].map(({ key, label, count }) => (
                    <button
                      key={key}
                      className={`filter-button ${filter === key ? 'active' : ''}`}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                      {count > 0 && <span className="badge">{count}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista */}
              {filtered.length === 0 ? (
                <div className="subs-empty-state">No hay usuarios en esta categoría.</div>
              ) : (
                <div className="users-list">
                  {filtered.map((userData) => {
                    const planRequest   = getPlanRequest(userData);
                    const hasPending    = planRequest?.status === 'pending';
                    const isPremium     = getPlanStatus(userData) === 'premium';
                    const membresiaVal  = getEditedValue(userData.id, 'membresia', userData.membresia);
                    const expVal        = getEditedValue(userData.id, 'fechaExpiracion', userData.fechaExpiracion);
                    const expDateInput  = expVal
                      ? new Date(expVal).toISOString().split('T')[0]
                      : '';

                    return (
                      <div
                        key={userData.id}
                        className={`user-item ${hasPending ? 'has-request' : ''}`}
                      >
                        {/* Info usuario */}
                        <div className="user-info">
                          <span className="user-name">{userData.name || 'Sin nombre'}</span>
                          <span className="user-email">{userData.email}</span>
                          <div className="user-meta">
                            <span className={`membership-status ${isPremium ? 'premium' : 'free'}`}>
                              {isPremium ? 'Premium' : 'Free'}
                            </span>
                            {userData.fechaExpiracion && (
                              <span className="expiration-date">
                                Vence {new Date(userData.fechaExpiracion).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </span>
                            )}
                            {userData.mesesComprados > 0 && (
                              <span className="months-bought">
                                {userData.mesesComprados} mes{userData.mesesComprados !== 1 ? 'es' : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Controles */}
                        <div className="membership-info">
                          <div className="membership-controls">
                            {/* Toggle membresía */}
                            <div className="membership-toggle">
                              <span className="toggle-label">Membresía</span>
                              <label className="toggle-switch">
                                <input
                                  type="checkbox"
                                  checked={membresiaVal || false}
                                  onChange={() => handleMembershipToggle(userData.id, membresiaVal)}
                                />
                                <span className="slider" />
                              </label>
                            </div>

                            {/* Fecha de expiración */}
                            <div className="expiration-input">
                              <span className="expiration-label">Expira</span>
                              <input
                                type="date"
                                className="expiration-date-input"
                                value={expDateInput}
                                onChange={(e) => handleExpirationChange(userData.id, e.target.value || null)}
                              />
                            </div>

                            {/* Guardar cambios */}
                            {hasChanges(userData.id) && (
                              <button
                                className="save-button"
                                onClick={() => saveUserChanges(userData.id)}
                              >
                                Guardar cambios
                              </button>
                            )}
                          </div>

                          {/* Solicitud pendiente */}
                          {hasPending && (
                            <div className="request-card">
                              <div className="request-card-row">
                                <span className="request-label">Solicitud:</span>
                                <span className="request-value">
                                  {planRequest.months || 1} mes{(planRequest.months || 1) !== 1 ? 'es' : ''}
                                </span>
                              </div>
                              <div className="request-card-row">
                                <span className="request-label">Precio:</span>
                                <span className="request-value">${planRequest.price || 0}</span>
                              </div>
                              <button
                                className="accept-request-button"
                                onClick={() => acceptPlanRequest(userData.id, planRequest, userData.mesesComprados || 0)}
                              >
                                ✓ Aceptar solicitud
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubsModal;