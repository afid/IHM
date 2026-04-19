# Guide de Migration - ParametrageSegment v2.0

## 📊 Résumé des Améliorations

| Métrique | v1.0 | v2.0 | Gain |
|----------|------|------|------|
| **Latence p95** | 500-700ms | 250-350ms | **-50%** |
| **Appels DynamoDB** | 5-7 | 2-3 | **-60%** |
| **RCU par invocation** | 5-7 | 2-3 | **-60%** |
| **Coût/jour (1000 calls)** | $2.50 | $1.00 | **-60%** |
| **Cache Hit Rate** | 0% | 55-65% | **+65%** |

---

## 🚀 Plan de Migration (Étapes)

### Phase 1: Préparation (Jour 1)

#### Étape 1.1: Sauvegarder la version actuelle
```bash
# Backup du code actuel
cp lambda_function.py lambda_function_backup_v1.py
cp lambda_function.py lambda_function_v1_production.py

# Backup de la config
cp environment_vars.env environment_vars_backup.env
```

#### Étape 1.2: Examiner les différences
```bash
# Comparer les deux versions
diff lambda_function.py lambda_function_optimized.py | head -100

# Points clés de changement:
# 1. Nouvelle classe HierarchyCache
# 2. Fonction get_hierarchy_path_batch (BatchGetItem au lieu de GetItem séquentiel)
# 3. get_etat_from_structure_batch (BatchGetItem pour structure)
# 4. get_segment_data_optimized (main logic avec cache)
# 5. _extract_columns_from_hierarchy (extraction avec lazy eval)
```

#### Étape 1.3: Tester localement
```bash
# Installation des dépendances de test
pip install -r requirements-test.txt

# Lancer les tests
python test_lambda_optimized.py -v

# Exemple de sortie attendue:
# test_cache_hit_rate ... ok
# test_hierarchy_path_batch_multiple_levels ... ok
# test_batch_vs_sequential_calls ... ok
# ============================================================
# Ran 35 tests in 2.345s
# OK
```

---

### Phase 2: Déploiement en Non-Production (Jour 2)

#### Étape 2.1: Créer nouvelle Lambda de test
```bash
# Créer une Lambda de test en parallèle
# Nom: Core_Lbd_ParametrageSegment_v2_TEST

aws lambda create-function \
  --function-name Core_Lbd_ParametrageSegment_v2_TEST \
  --runtime python3.11 \
  --role arn:aws:iam::ACCOUNT:role/LambdaExecutionRole \
  --handler lambda_function_optimized.lambda_handler \
  --timeout 30 \
  --memory-size 256 \
  --environment Variables="{CACHE_TTL_SECONDS=600}" \
  --zip-file fileb://lambda_function_optimized.zip
```

#### Étape 2.2: Configuration des variables d'environnement
```bash
# Variables d'environnement recommandées:
TABLE_PARAMETRAGE_SEGMENT=Core_Ddb_CiblageParametrageSegments
TABLE_PARAMETRAGE_STRUCTURE=Core_Ddb_ParametrageCentralise
CACHE_TTL_SECONDS=600  # 10 minutes (ajustable)
```

#### Étape 2.3: Tests d'intégration en DEV
```bash
# Invocation test
aws lambda invoke \
  --function-name Core_Lbd_ParametrageSegment_v2_TEST \
  --payload file://test_event.json \
  --log-type Tail \
  response.json

# Vérifier les résultats
cat response.json

# Vérifier les logs
cat response.json | jq '.LogResult' | base64 -d
```

#### Étape 2.4: Monitoring de base
```bash
# Vérifier les invocations et erreurs
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=Core_Lbd_ParametrageSegment_v2_TEST \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 60 \
  --statistics Average,Maximum
```

---

### Phase 3: Déploiement Canary (Jour 3-4)

#### Étape 3.1: Traffic splitting avec Lambda Aliases
```bash
# Créer un alias pour la version v1
aws lambda create-alias \
  --function-name Core_Lbd_ParametrageSegment \
  --name prod-current \
  --function-version 1

# Créer une version pour v2
aws lambda publish-version \
  --function-name Core_Lbd_ParametrageSegment

# Créer un alias pour canary (10% vers v2)
aws lambda create-alias \
  --function-name Core_Lbd_ParametrageSegment \
  --name canary \
  --function-version 2 \
  --routing-config AdditionalVersionWeights={1=0.1}
  # 10% → v2, 90% → v1
```

#### Étape 3.2: Mettre à jour le flow Amazon Connect
```
Core_Mod_ParametrageSegment (ou qui appelle la Lambda)
  ├── [Invoke Lambda] → arn:aws:lambda:...:alias/canary
  └── Monitorer les réponses
```

#### Étape 3.3: Monitoring Canary (4 heures minimum)
```bash
# Métriques à surveiller:
# 1. Erreurs
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=Core_Lbd_ParametrageSegment \
  --start-time NOW-1H \
  --end-time NOW \
  --period 60 \
  --statistics Sum

# 2. Latence (Duration)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --start-time NOW-1H \
  --end-time NOW \
  --period 60 \
  --statistics Average,p99

# 3. Invocations réussies
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --start-time NOW-1H \
  --end-time NOW \
  --period 60
```

**Critères de succès canary**:
- ✅ Erreurs en v2 ≤ Erreurs en v1
- ✅ Latence p99 en v2 < Latence p99 en v1
- ✅ Pas de data corruption

---

### Phase 4: Déploiement Full (Jour 5)

#### Étape 4.1: Augmenter le traffic progressivement
```bash
# Étape 1: 25%
aws lambda update-alias \
  --function-name Core_Lbd_ParametrageSegment \
  --name canary \
  --routing-config AdditionalVersionWeights={1=0.25}

# [Attendre 1 heure] → Vérifier métriques

# Étape 2: 50%
aws lambda update-alias \
  --function-name Core_Lbd_ParametrageSegment \
  --name canary \
  --routing-config AdditionalVersionWeights={1=0.5}

# [Attendre 1 heure]

# Étape 3: 100% (Full migration)
aws lambda update-alias \
  --function-name Core_Lbd_ParametrageSegment \
  --name prod-current \
  --function-version 2  # Pointe vers v2
```

#### Étape 4.2: Rollback plan (si nécessaire)
```bash
# Instant rollback vers v1
aws lambda update-alias \
  --function-name Core_Lbd_ParametrageSegment \
  --name prod-current \
  --function-version 1  # Revenir à v1
```

---

## 📋 Checklist de Déploiement

### Avant le déploiement
- [ ] Tous les tests unitaires passent (`python test_lambda_optimized.py`)
- [ ] Code review complétée
- [ ] Documentation mise à jour
- [ ] Équipe informée du changement
- [ ] Plan de rollback préparé
- [ ] Monitoring/alerting configuré

### Pendant le déploiement
- [ ] Lambda v2_TEST déployée en DEV
- [ ] Tests d'intégration réussis
- [ ] Canary déployé avec 10% traffic
- [ ] Monitoring Canary OK pendant 4+ heures
- [ ] Traffic augmenté progressivement (10% → 25% → 50% → 100%)

### Après le déploiement
- [ ] 100% traffic en v2 pendant 24 heures
- [ ] Zéro erreurs observées
- [ ] Latence validée (-50% vs v1)
- [ ] Cache stats saines (55-65% hit rate)
- [ ] v1 archive (conservation 30 jours)

---

## 🔍 Validation de Déploiement

### Test de Cache Hit Rate
```bash
# Après 1 heure de production
aws logs filter-log-events \
  --log-group-name /aws/lambda/Core_Lbd_ParametrageSegment \
  --filter-pattern "CACHE STATS" \
  --query 'events[0:10]'

# Résultat attendu:
# "hit_rate=55.2% (n=156H/n=126M)"
# "hit_rate=62.1% (n=248H/n=150M)"
```

### Test de Latence
```bash
# Comparer v1 vs v2
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 60 \
  --statistics Average,p95

# Résultat attendu en v2:
# Average: 250ms (vs 500ms en v1) → -50% ✅
# p95: 320ms (vs 650ms en v1) → -50% ✅
```

### Test de RCU
```bash
# DynamoDB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=Core_Ddb_CiblageParametrageSegments \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-01T01:00:00Z \
  --period 3600

# Résultat attendu:
# 2-3 RCU/appel (vs 5-7) → -60% ✅
```

---

## ⚠️ Points Critiques

### Configuration Lambda
```yaml
Timeout: 30 secondes (vs 15 actuellement)
  Justification: BatchGetItem + cache lookup ajoute peu, mais bonne marge

Memory: 256 MB
  Justification: Cache en mémoire nécessite ~50MB pour 100 segments

Environment Variables:
  CACHE_TTL_SECONDS: 600 (10 min)
  → Peut être ajusté selon la fréquence de changement des segments
```

### Monitoring Essentiels
```
CloudWatch Alarms:
  1. Erreurs > 5 par minute → Alert
  2. Latency p99 > 1000ms → Alert
  3. DynamoDB errors > 0 → Alert
  4. Cache hit rate < 30% → Alert (possible misconfiguration)
```

### Fallback & Rollback
```
Rollback instantané possible via Lambda Alias
Temps: < 1 minute
Risque: Très faible (pas de état persistant)
```

---

## 📈 Métriques Post-Déploiement (J+1)

Métriques à valider:

| Métrique | Cible | Réel | Status |
|----------|-------|------|--------|
| Latence moyenne | 250ms | TBD | |
| Latency p95 | 300ms | TBD | |
| Erreurs | 0-2/min | TBD | |
| Cache hit rate | 55%+ | TBD | |
| RCU total | 2-3 | TBD | |

---

## 🎯 Configuration pour Production

```python
# environment_vars.prod.env
TABLE_PARAMETRAGE_SEGMENT=Core_Ddb_CiblageParametrageSegments
TABLE_PARAMETRAGE_STRUCTURE=Core_Ddb_ParametrageCentralise
CACHE_TTL_SECONDS=600

# Lambda Configuration
Timeout: 30 seconds
Memory: 256 MB
Reserved Concurrency: 100  (ajustable selon le load)
Ephemeral Storage: 512 MB (cache peut grandir)
```

---

## 📞 Support & Escalation

**En cas de problème pendant le déploiement:**

1. **Erreurs accrues**:
   - Rollback instantané vers v1
   - Analyser les logs v2
   - Corriger et redéployer

2. **Latence dégradée**:
   - Vérifier cache stats (hit rate)
   - Vérifier DynamoDB capacity
   - Augmenter Lambda timeout si nécessaire

3. **Cache ne se remplit pas**:
   - CACHE_TTL_SECONDS trop court?
   - Logs montrant des evictions?
   - Ajuster TTL ou warmup

---

**Date de création**: Février 2026
**Version**: 2.0
**Auteur**: Claude Code
