import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../server/api';
import './guias.css';

const formatDate = (value) => {
  if (!value) return '';
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
};

const getMemberKey = (member) => member.uid || member.email;

const getGuideMembers = (group, user) => {
  const members = [...(group.participants || [])];
  if (!members.some((member) => member.uid === user.uid || member.email === user.email)) {
    members.unshift({ uid: user.uid, email: user.email || '', name: user.displayName || user.email || 'Usuario', role: 'editor' });
  }
  return members.map((member) => ({
    ...(member.uid ? { uid: member.uid } : {}),
    ...(member.email ? { email: member.email } : {}),
    name: member.name || member.email || 'Sin nombre',
    role: member.role || 'lector',
  }));
};

const canManageGroup = (group, user) => group.ownerId === user.uid || group.participants?.some(
  (participant) => participant.uid === user.uid && participant.role === 'editor'
);

const Guias = ({ user, setCurrentView }) => {
  const [groups, setGroups] = useState([]);
  const [guides, setGuides] = useState([]);
  const [selectedGuideId, setSelectedGuideId] = useState(null);
  const [guideName, setGuideName] = useState('');
  const [deadline, setDeadline] = useState('');
  const [hasEvaluation, setHasEvaluation] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [authorizedIds, setAuthorizedIds] = useState([]);
  const [attendeeFilter, setAttendeeFilter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    const unsubscribe = onSnapshot(collection(db, 'grupos'), (snapshot) => {
      const email = user.email?.toLowerCase();
      setGroups(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((group) => (
        group.ownerId === user.uid || group.participants?.some((member) => member.email?.toLowerCase() === email)
      )));
    });
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    const unsubscribe = onSnapshot(collection(db, 'GUIAS'), (snapshot) => {
      const email = user.email?.toLowerCase();
      setGuides(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((guide) => (
        guide.ownerId === user.uid || guide.participants?.some((member) => member.email?.toLowerCase() === email)
      )));
    });
    return unsubscribe;
  }, [user]);

  const manageableGroups = useMemo(() => groups.filter((group) => canManageGroup(group, user)), [groups, user]);
  const selectedGuide = guides.find((guide) => guide.id === selectedGuideId) || guides[0];

  const createGuide = async (event) => {
    event.preventDefault();
    const group = groups.find((item) => item.id === selectedGroupId);
    if (!group || !guideName.trim() || !canManageGroup(group, user)) return;
    setSaving(true);
    try {
      const guide = await addDoc(collection(db, 'GUIAS'), {
        name: guideName.trim(), groupId: group.id, groupName: group.groupName || 'Grupo',
        ownerId: user.uid, ownerName: user.displayName || user.email || 'Usuario',
        participants: getGuideMembers(group, user),
        authorizedIds: [user.uid, ...authorizedIds.filter((id) => id !== user.uid)],
        deadline: deadline || null,
        hasEvaluation,
        attendance: {}, createdAt: serverTimestamp(),
      });
      setSelectedGuideId(guide.id);
      setGuideName('');
      setDeadline('');
      setHasEvaluation(false);
      setSelectedGroupId('');
      setAuthorizedIds([]);
    } finally { setSaving(false); }
  };

  const canAuthorizeAttendance = (guide) => guide.ownerId === user.uid || (guide.authorizedIds || []).includes(user.uid);

  const toggleAttendance = async (member) => {
    if (!selectedGuide || !canAuthorizeAttendance(selectedGuide)) return;
    const memberKey = getMemberKey(member);
    const attendance = { ...(selectedGuide.attendance || {}) };
    if (attendance[memberKey]) delete attendance[memberKey];
    else attendance[memberKey] = { approvedBy: user.uid, approvedByName: user.displayName || user.email || 'Usuario', approvedAt: new Date().toISOString() };
    setSaving(true);
    try {
      await updateDoc(doc(db, 'GUIAS', selectedGuide.id), { attendance });
    } catch (error) {
      console.error('Error actualizando asistencia:', error);
      window.alert('No se pudo actualizar la asistencia. Revisa tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  const saveScore = async (member, value) => {
    if (!selectedGuide || !selectedGuide.hasEvaluation || !canAuthorizeAttendance(selectedGuide)) return;
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      window.alert('El puntaje debe estar entre 0 y 100.');
      return;
    }
    const memberKey = getMemberKey(member);
    const currentRecord = selectedGuide.attendance?.[memberKey];
    if (!currentRecord) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'GUIAS', selectedGuide.id), {
        attendance: {
          ...(selectedGuide.attendance || {}),
          [memberKey]: { ...currentRecord, score },
        },
      });
    } catch (error) {
      console.error('Error guardando puntaje:', error);
      window.alert('No se pudo guardar el puntaje. Revisa tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  const deleteGuide = async () => {
    if (!selectedGuide || selectedGuide.ownerId !== user.uid) return;
    if (!window.confirm(`¿Eliminar la guía "${selectedGuide.name}"?`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, 'GUIAS', selectedGuide.id));
      setSelectedGuideId(null);
    } catch (error) {
      console.error('Error eliminando guía:', error);
      window.alert('No se pudo eliminar la guía. Revisa tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  const getProgress = (guide) => {
    const total = (guide.participants || []).length;
    const done = (guide.participants || []).filter((member) => {
      const record = guide.attendance?.[getMemberKey(member)];
      return record && (!guide.hasEvaluation || typeof record.score === 'number');
    }).length;
    return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
  };

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const guideMembers = selectedGroup ? getGuideMembers(selectedGroup, user) : [];
  const visibleAttendees = (selectedGuide?.participants || [])
    .filter((member) =>
      `${member.name} ${member.email}`.toLowerCase().includes(attendeeFilter.toLowerCase())
    )
    .sort((firstMember, secondMember) => {
      const firstAttended = Boolean(selectedGuide?.attendance?.[getMemberKey(firstMember)]);
      const secondAttended = Boolean(selectedGuide?.attendance?.[getMemberKey(secondMember)]);
      return Number(firstAttended) - Number(secondAttended);
    });

  return (
    <div className="guias-container">
      <div className="guias-header">
        <span className="guias-kicker">Control de actividades</span>
        <h1>Guías y asistencia</h1>
        <p>
          Crea una guía desde un grupo y registra quién completó cada actividad.
        </p>
      </div>

      {manageableGroups.length > 0 && <form className="guia-create" onSubmit={createGuide}>
        <div><label htmlFor="guide-name">Nombre de la guía</label><input id="guide-name" value={guideName} onChange={(event) => setGuideName(event.target.value)} placeholder="Ej. Inducción de seguridad" required /></div>
        <div><label htmlFor="guide-group">Grupo</label><select id="guide-group" value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)} required><option value="">Selecciona un grupo</option>{manageableGroups.map((group) => <option key={group.id} value={group.id}>{group.groupName}</option>)}</select></div>
        <div><label htmlFor="guide-deadline">Fecha límite de entrega</label><input id="guide-deadline" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></div>
        <label className="evaluation-option"><input type="checkbox" checked={hasEvaluation} onChange={(event) => setHasEvaluation(event.target.checked)} /><span className="authorizer-check" aria-hidden="true">✓</span><span>  Esta guía tiene evaluación</span></label>
        {guideMembers.length > 0 && <fieldset className="guide-authorizers"><legend>Quién puede confirmar asistencia</legend>{guideMembers.filter((member) => getMemberKey(member) !== user.uid).map((member) => <label className="authorizer-option" key={getMemberKey(member)}><input type="checkbox" checked={authorizedIds.includes(getMemberKey(member))} onChange={() => setAuthorizedIds((current) => current.includes(getMemberKey(member)) ? current.filter((id) => id !== getMemberKey(member)) : [...current, getMemberKey(member)])} /><span className="authorizer-check" aria-hidden="true">✓</span><span>{member.name}</span></label>)}</fieldset>}
        <button type="submit" disabled={saving}>Crear guía</button>
      </form>}

      <div className="guias-workspace">
        <aside className="guias-list"><h2>Mis guías</h2>{guides.length === 0 && <p>No hay guías disponibles.</p>}{guides.map((guide) => { const progress = getProgress(guide); return <button className={`${selectedGuide?.id === guide.id ? 'selected' : ''} ${progress.percent === 100 ? 'completed' : ''}`} type="button" key={guide.id} onClick={() => setSelectedGuideId(guide.id)}><strong>{guide.name}</strong><span>{guide.groupName} · {progress.percent}% {progress.percent === 100 ? '· Terminada' : ''}</span><i className="guide-list-progress"><i style={{ width: `${progress.percent}%` }} /></i></button>; })}</aside>
        {selectedGuide ? <section className="guia-detail"><div className="guia-detail-header"><div><span className="guias-kicker">{selectedGuide.groupName}</span><h2>{selectedGuide.name}</h2><p>Creada por {selectedGuide.ownerName} · {formatDate(selectedGuide.createdAt)}</p>{selectedGuide.deadline && <p className={selectedGuide.deadline < new Date().toISOString().slice(0, 10) ? 'guide-deadline expired' : 'guide-deadline'}>Fecha límite: {formatDate(`${selectedGuide.deadline}T00:00:00`)}</p>}</div><div className="guia-detail-actions"><strong className="guia-progress">{getProgress(selectedGuide).percent}%<small> progreso</small></strong>{selectedGuide.ownerId === user.uid && <button className="delete-guide-button" type="button" onClick={deleteGuide} disabled={saving}>Eliminar guía</button>}</div></div>
          <div className="progress-track"><span style={{ width: `${getProgress(selectedGuide).percent}%` }} /></div>
          <div className="attendance-tools"><input value={attendeeFilter} onChange={(event) => setAttendeeFilter(event.target.value)} placeholder="Filtrar asistentes por nombre" /></div>
          <div className="attendance-list">{visibleAttendees.map((member) => { const record = selectedGuide.attendance?.[getMemberKey(member)]; const completed = record && (!selectedGuide.hasEvaluation || typeof record.score === 'number'); return <div className={completed ? 'attendance done' : 'attendance'} key={getMemberKey(member)}><div><strong>{member.name}</strong><span>{record ? `Confirmó ${record.approvedByName} · ${formatDate(record.approvedAt)}` : member.email}</span>{selectedGuide.hasEvaluation && record && <label className="score-field">Puntaje <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength="3" defaultValue={record.score ?? ''} placeholder="0-100" disabled={!canAuthorizeAttendance(selectedGuide) || saving} onChange={(event) => { event.target.value = event.target.value.replace(/\D/g, '').slice(0, 3); }} onBlur={(event) => { if (event.target.value !== '') saveScore(member, event.target.value); }} /><small>/ 100</small></label>}</div><button type="button" onClick={() => toggleAttendance(member)} disabled={!canAuthorizeAttendance(selectedGuide) || saving}>{completed ? 'Asistió' : record ? 'Evaluación pendiente' : 'Pendiente'}</button></div>; })}</div>
        </section> : <section className="guia-detail guia-empty"><h2>Selecciona una guía</h2><p>Las guías que te compartan aparecerán aquí.</p></section>}
      </div>
      <button className="guias-back" type="button" onClick={() => setCurrentView('home')}>Volver al inicio</button>
    </div>
  );
};

export default Guias;
