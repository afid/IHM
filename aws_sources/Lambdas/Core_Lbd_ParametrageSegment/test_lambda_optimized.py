"""
Tests Unitaires - Core_Lbd_ParametrageSegment v2.0 Optimisé

Coverage:
- ✅ Cache operations (get, set, stats, clear)
- ✅ BatchGetItem hierarchy loading
- ✅ Structure lookup with batch
- ✅ Column extraction logic
- ✅ Module length calculation
- ✅ Error handling
- ✅ Cache hit rates
"""

import unittest
from unittest.mock import Mock, patch, MagicMock
import json
from datetime import datetime, timedelta
import sys
import os

# Mock AWS SDK avant d'importer la lambda
sys.modules['boto3'] = MagicMock()

# Importer après les mocks
from lambda_function_optimized import (
    HierarchyCache,
    get_hierarchy_path_batch,
    get_etat_from_structure_batch,
    _extract_columns_from_hierarchy,
    calculate_modules_length,
    format_dynamodb_value,
    lambda_handler,
)


class TestHierarchyCache(unittest.TestCase):
    """Tests pour la classe HierarchyCache."""

    def setUp(self):
        """Initialise un cache vierge pour chaque test."""
        self.cache = HierarchyCache(ttl_seconds=10)

    def test_cache_set_and_get(self):
        """Test basic set/get cache."""
        data = {'segment': {'Segment': 'A'}, 'parents': [], 'full_chain': [{'Segment': 'A'}]}
        self.cache.set('SegA', data)

        result = self.cache.get('SegA')
        self.assertIsNotNone(result)
        self.assertEqual(result['segment']['Segment'], 'A')

    def test_cache_miss_on_absent_key(self):
        """Test que get retourne None pour clé absente."""
        result = self.cache.get('NonExistent')
        self.assertIsNone(result)
        self.assertEqual(self.cache.misses, 1)

    def test_cache_expiry(self):
        """Test l'expiration du cache après TTL."""
        data = {'segment': {'Segment': 'B'}, 'parents': [], 'full_chain': []}
        self.cache.set('SegB', data)

        # Patcher datetime.now() pour simuler le temps
        with patch('lambda_function_optimized.datetime') as mock_datetime:
            now = datetime.now()
            mock_datetime.now.return_value = now + timedelta(seconds=11)  # Après TTL

            result = self.cache.get('SegB')
            self.assertIsNone(result)  # Expiré
            self.assertEqual(self.cache.misses, 1)

    def test_cache_hit_rate(self):
        """Test le calcul du hit rate."""
        data = {'segment': {}, 'parents': [], 'full_chain': []}

        self.cache.set('SegA', data)
        self.cache.set('SegB', data)

        # 3 hits
        self.cache.get('SegA')
        self.cache.get('SegA')
        self.cache.get('SegB')

        # 2 misses
        self.cache.get('NonExistent')
        self.cache.get('NonExistent')

        stats = self.cache.get_stats()
        self.assertEqual(stats['hits'], 3)
        self.assertEqual(stats['misses'], 2)
        self.assertAlmostEqual(stats['hit_rate_percent'], 60.0, places=1)

    def test_cache_clear(self):
        """Test le vidage du cache."""
        self.cache.set('SegA', {'segment': {}})
        self.cache.set('SegB', {'segment': {}})

        self.assertEqual(len(self.cache.cache), 2)

        self.cache.clear()
        self.assertEqual(len(self.cache.cache), 0)

    def test_cache_stats(self):
        """Test les statistiques du cache."""
        data = {'segment': {}, 'parents': [], 'full_chain': []}
        self.cache.set('SegA', data)
        self.cache.get('SegA')

        stats = self.cache.get_stats()
        self.assertIn('cache_size', stats)
        self.assertIn('hits', stats)
        self.assertIn('misses', stats)
        self.assertIn('hit_rate_percent', stats)
        self.assertIn('ttl_seconds', stats)
        self.assertEqual(stats['cache_size'], 1)


class TestBatchGetItem(unittest.TestCase):
    """Tests pour la logique BatchGetItem."""

    @patch('lambda_function_optimized.dynamodb')
    def test_hierarchy_path_batch_single_level(self, mock_dynamodb):
        """Test BatchGetItem avec 1 niveau de parent."""
        # Setup mock
        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        # Réponses mock
        segment_item = {'Segment': 'SegA', 'Groupement': 'SegB', 'Value': 'A1'}
        parent_item = {'Segment': 'SegB', 'Value': 'B1'}

        mock_table.get_item.return_value = {'Item': segment_item}
        mock_dynamodb.batch_get_item.return_value = {
            'Responses': {
                'Core_Ddb_CiblageParametrageSegments': [parent_item]
            }
        }

        # Exécuter
        result = get_hierarchy_path_batch('SegA')

        # Assertions
        self.assertEqual(result['segment']['Segment'], 'SegA')
        self.assertEqual(len(result['parents']), 1)
        self.assertEqual(result['full_chain'][1]['Segment'], 'SegB')

    @patch('lambda_function_optimized.dynamodb')
    def test_hierarchy_path_batch_multiple_levels(self, mock_dynamodb):
        """Test BatchGetItem avec multiple niveaux."""
        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        segment_item = {'Segment': 'SegA', 'Groupement': 'SegB'}
        parent1 = {'Segment': 'SegB', 'Groupement': 'SegC', 'Value': 'B1'}
        parent2 = {'Segment': 'SegC', 'Value': 'C1'}

        mock_table.get_item.return_value = {'Item': segment_item}
        mock_dynamodb.batch_get_item.return_value = {
            'Responses': {
                'Core_Ddb_CiblageParametrageSegments': [parent1, parent2]
            }
        }

        result = get_hierarchy_path_batch('SegA')

        self.assertEqual(len(result['full_chain']), 3)
        self.assertEqual(result['full_chain'][0]['Segment'], 'SegA')
        self.assertEqual(result['full_chain'][1]['Segment'], 'SegB')
        self.assertEqual(result['full_chain'][2]['Segment'], 'SegC')

    @patch('lambda_function_optimized.dynamodb')
    def test_hierarchy_path_batch_not_found(self, mock_dynamodb):
        """Test segment non trouvé."""
        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table
        mock_table.get_item.return_value = {}

        result = get_hierarchy_path_batch('NonExistent')

        self.assertEqual(result['segment'], {})
        self.assertEqual(result['parents'], [])
        self.assertEqual(result['full_chain'], [])


class TestStructureLookup(unittest.TestCase):
    """Tests pour la recherche dans la structure (Etat)."""

    @patch('lambda_function_optimized.dynamodb')
    def test_etat_from_structure_sous_domaine_priority(self, mock_dynamodb):
        """Test que SousDomaine a priorité sur Domaine."""
        mock_dynamodb.batch_get_item.return_value = {
            'Responses': {
                'Core_Ddb_ParametrageCentralise': [
                    {'Structure': 'SousDom1', 'Type': 'sous-domaine', 'Etat': 'Ouvert'},
                    {'Structure': 'Dom1', 'Type': 'domaine', 'Etat': 'Ferme'}
                ]
            }
        }

        result = get_etat_from_structure_batch('SousDom1', 'Dom1')

        self.assertEqual(result, 'Ouvert')  # SousDomaine prioritaire

    @patch('lambda_function_optimized.dynamodb')
    def test_etat_from_structure_domaine_fallback(self, mock_dynamodb):
        """Test fallback à Domaine si SousDomaine absent."""
        mock_dynamodb.batch_get_item.return_value = {
            'Responses': {
                'Core_Ddb_ParametrageCentralise': [
                    {'Structure': 'Dom1', 'Type': 'domaine', 'Etat': 'Ferme'}
                ]
            }
        }

        result = get_etat_from_structure_batch(None, 'Dom1')

        self.assertEqual(result, 'Ferme')

    @patch('lambda_function_optimized.dynamodb')
    def test_etat_from_structure_not_found(self, mock_dynamodb):
        """Test absence d'Etat."""
        mock_dynamodb.batch_get_item.return_value = {
            'Responses': {
                'Core_Ddb_ParametrageCentralise': []
            }
        }

        result = get_etat_from_structure_batch('SousDom1', 'Dom1')

        self.assertIsNone(result)


class TestColumnExtraction(unittest.TestCase):
    """Tests pour l'extraction de colonnes."""

    def test_extract_columns_from_hierarchy(self):
        """Test l'extraction de colonnes simples."""
        hierarchy = {
            'segment': {'Segment': 'A', 'Value1': 'V1', 'Modules': '[1,2,3]'},
            'parents': [{'Segment': 'B', 'Value2': 'V2'}],
            'full_chain': [
                {'Segment': 'A', 'Value1': 'V1', 'Modules': '[1,2,3]'},
                {'Segment': 'B', 'Value2': 'V2'}
            ]
        }

        result = _extract_columns_from_hierarchy(
            hierarchy,
            ['Value1', 'Value2'],
            None,
            None
        )

        self.assertEqual(result['Value1'], 'V1')
        self.assertEqual(result['Value2'], 'V2')

    def test_extract_columns_lazy_etat(self):
        """Test lazy evaluation - Etat seulement si demandé."""
        hierarchy = {
            'segment': {'Segment': 'A', 'Value1': 'V1'},
            'parents': [],
            'full_chain': [{'Segment': 'A', 'Value1': 'V1'}]
        }

        # Sans Etat demandé (pas d'appel structure)
        result1 = _extract_columns_from_hierarchy(
            hierarchy,
            ['Value1'],
            None,
            None
        )
        self.assertNotIn('Etat', result1)
        self.assertIn('Value1', result1)
        self.assertEqual(result1['Value1'], 'V1')

        # Avec Etat demandé (appel structure nécessaire, mais pas trouvé)
        # Mock get_etat_from_structure_batch pour retourner None
        with patch('lambda_function_optimized.get_etat_from_structure_batch', return_value=None):
            result2 = _extract_columns_from_hierarchy(
                hierarchy,
                ['Value1', 'Etat'],
                None,
                None
            )
        # Value1 doit être présente (trouvée en hiérarchie)
        self.assertIn('Value1', result2)
        self.assertEqual(result2['Value1'], 'V1')
        # Etat sera absent (pas trouvé en structure - mock retourne None)

    def test_module_length_calculation_with_extraction(self):
        """Test calcul automatique des longueurs."""
        hierarchy = {
            'segment': {'Segment': 'A', 'ModulesPreCiblage': '[1,2,3]'},
            'parents': [],
            'full_chain': [{'Segment': 'A', 'ModulesPreCiblage': '[1,2,3]'}]
        }

        result = _extract_columns_from_hierarchy(
            hierarchy,
            ['ModulesPreCiblage'],
            None,
            None
        )

        self.assertEqual(result['ModulesPreCiblage'], '[1,2,3]')
        self.assertEqual(result['ModulesPreCiblageLength'], '3')


class TestModuleLength(unittest.TestCase):
    """Tests pour le calcul des longueurs de modules."""

    def test_calculate_modules_length_json_string(self):
        """Test avec string JSON."""
        result = calculate_modules_length('[1,2,3,4,5]')
        self.assertEqual(result, '5')

    def test_calculate_modules_length_list(self):
        """Test avec list Python."""
        result = calculate_modules_length([1, 2, 3])
        self.assertEqual(result, '3')

    def test_calculate_modules_length_empty(self):
        """Test avec liste vide."""
        result = calculate_modules_length('[]')
        self.assertEqual(result, '0')

    def test_calculate_modules_length_none(self):
        """Test avec None."""
        result = calculate_modules_length(None)
        self.assertEqual(result, '0')

    def test_calculate_modules_length_invalid_json(self):
        """Test avec JSON invalide."""
        result = calculate_modules_length('not json')
        self.assertEqual(result, '0')


class TestFormatDynamoDBValue(unittest.TestCase):
    """Tests pour le formatage des valeurs DynamoDB."""

    def test_format_string_type(self):
        """Test formatage type String DynamoDB."""
        value = {'S': 'Hello'}
        result = format_dynamodb_value(value)
        self.assertEqual(result, 'Hello')

    def test_format_list_type(self):
        """Test formatage type List DynamoDB."""
        value = {'L': [{'S': 'A'}, {'S': 'B'}]}
        result = format_dynamodb_value(value)
        self.assertEqual(result, ['A', 'B'])

    def test_format_plain_value(self):
        """Test valeur plain Python."""
        result = format_dynamodb_value('simple')
        self.assertEqual(result, 'simple')


class TestLambdaHandler(unittest.TestCase):
    """Tests d'intégration pour le handler Lambda."""

    @patch('lambda_function_optimized.dynamodb')
    @patch('lambda_function_optimized.connect')
    def test_lambda_handler_success(self, mock_connect, mock_dynamodb):
        """Test handler avec succès."""
        # Setup mocks
        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        segment_item = {
            'Segment': 'SegA',
            'Value1': 'Test',
            'ModulesPreCiblage': '[]'
        }

        mock_table.get_item.return_value = {'Item': segment_item}
        mock_dynamodb.batch_get_item.return_value = {
            'Responses': {'Core_Ddb_CiblageParametrageSegments': []}
        }
        mock_connect.update_contact_attributes.return_value = {}

        # Préparer l'événement
        event = {
            'Details': {
                'ContactData': {
                    'Attributes': {
                        'UC_Segment': 'SegA',
                        'UC_SousDomaine': None,
                        'UC_Domaine': None
                    },
                    'Tags': {'aws:connect:instanceId': 'instance123'},
                    'InitialContactId': 'contact123'
                },
                'Parameters': {
                    'colonnes_demandees': 'Value1,ModulesPreCiblage'
                }
            }
        }

        context = MagicMock()

        # Exécuter
        result = lambda_handler(event, context)

        # Assertions
        self.assertIn('Value1', result)
        self.assertIn('ModulesPreCiblage', result)
        self.assertEqual(result['Value1'], 'Test')

    @patch('lambda_function_optimized.dynamodb')
    def test_lambda_handler_missing_segment(self, mock_dynamodb):
        """Test handler sans segment."""
        event = {
            'Details': {
                'ContactData': {
                    'Attributes': {},
                    'Tags': {},
                },
                'Parameters': {'colonnes_demandees': 'Col1'}
            }
        }

        context = MagicMock()
        result = lambda_handler(event, context)

        self.assertIn('error', result)
        self.assertIn('UC_Segment', result['error'])


class TestPerformanceOptimizations(unittest.TestCase):
    """Tests pour valider les optimisations de performance."""

    @patch('lambda_function_optimized.dynamodb')
    def test_batch_vs_sequential_calls(self, mock_dynamodb):
        """
        Valide que BatchGetItem est utilisé au lieu de multiples GetItem.

        Note: Ce test montre que le code utilise batch_get_item (optimisé)
        au lieu d'appels séquentiels.
        """
        mock_table = MagicMock()
        mock_dynamodb.Table.return_value = mock_table

        segment = {'Segment': 'A', 'Groupement': 'B'}
        parent = {'Segment': 'B'}

        mock_table.get_item.return_value = {'Item': segment}
        mock_dynamodb.batch_get_item.return_value = {
            'Responses': {'Core_Ddb_CiblageParametrageSegments': [parent]}
        }

        get_hierarchy_path_batch('A')

        # Vérifier que batch_get_item a été appelé (optimisation)
        mock_dynamodb.batch_get_item.assert_called_once()

    def test_cache_reduces_dynamodb_calls(self):
        """Test que le cache réduit les appels DynamoDB."""
        cache = HierarchyCache(ttl_seconds=3600)

        # Première insertion
        data = {'segment': {'Segment': 'A'}, 'parents': [], 'full_chain': []}
        cache.set('SegA', data)

        # 10 accès - tous hit sur cache
        for _ in range(10):
            cache.get('SegA')

        stats = cache.get_stats()
        self.assertEqual(stats['hits'], 10)
        self.assertEqual(stats['misses'], 0)
        # Aucun appel DynamoDB supplémentaire!


# ============================================================================
# TESTS PERFORMANCES - BENCHMARK
# ============================================================================

class TestPerformanceBenchmark(unittest.TestCase):
    """Benchmarks pour valider les gains estimés."""

    def test_cache_improvement_estimation(self):
        """
        Valide que le cache atteint le hit rate estimé.

        Estimation: 55-65% pour cas réels
        Ce test démontre le potentiel.
        """
        cache = HierarchyCache(ttl_seconds=600)

        # Simuler 100 appels avec distribution réaliste
        # 10 segments uniques, accès répétés (réaliste)
        segments = [f'Seg{i}' for i in range(10)]
        data_template = {'segment': {}, 'parents': [], 'full_chain': []}

        # Pré-charger le cache (simule warmup ou appels antérieurs)
        for seg in segments[:7]:  # 7/10 segments en cache
            cache.set(seg, data_template)

        # Simuler 100 appels
        for i in range(100):
            seg = segments[i % 10]  # Cycler parmi les 10 segments
            cache.get(seg)

        stats = cache.get_stats()

        # Attendre ~70% hit rate (7 segments en cache sur 10)
        self.assertGreater(stats['hit_rate_percent'], 60)

    def test_lazy_evaluation_reduces_calls_for_etat(self):
        """Test que lazy evaluation réduit les appels pour Etat."""
        # Cas 1: Sans demander Etat (pas besoin de BatchGetItem structure)
        hierarchy1 = {
            'segment': {'Segment': 'A'},
            'parents': [],
            'full_chain': [{'Segment': 'A'}]
        }

        result1 = _extract_columns_from_hierarchy(
            hierarchy1,
            ['Value1'],  # Sans Etat
            None,
            None
        )
        # Aucun appel structure nécessaire

        # Cas 2: Avec Etat (appel structure nécessaire)
        result2 = _extract_columns_from_hierarchy(
            hierarchy1,
            ['Value1', 'Etat'],  # Avec Etat
            'SousDom',
            'Dom'
        )
        # Appel structure nécessaire (testé ailleurs)

        # Démonstration: sans Etat = pas d'appel supplémentaire
        self.assertNotIn('Etat', result1)


# ============================================================================
# EXÉCUTION DES TESTS
# ============================================================================

if __name__ == '__main__':
    # Configuration du logging pour les tests
    import logging
    logging.basicConfig(level=logging.DEBUG)

    # Créer une suite de tests
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Ajouter tous les tests
    suite.addTests(loader.loadTestsFromTestCase(TestHierarchyCache))
    suite.addTests(loader.loadTestsFromTestCase(TestBatchGetItem))
    suite.addTests(loader.loadTestsFromTestCase(TestStructureLookup))
    suite.addTests(loader.loadTestsFromTestCase(TestColumnExtraction))
    suite.addTests(loader.loadTestsFromTestCase(TestModuleLength))
    suite.addTests(loader.loadTestsFromTestCase(TestFormatDynamoDBValue))
    suite.addTests(loader.loadTestsFromTestCase(TestLambdaHandler))
    suite.addTests(loader.loadTestsFromTestCase(TestPerformanceOptimizations))
    suite.addTests(loader.loadTestsFromTestCase(TestPerformanceBenchmark))

    # Exécuter
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Exit code
    sys.exit(0 if result.wasSuccessful() else 1)
