import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Platform,
    StatusBar,
    SafeAreaView,
} from 'react-native';

interface EloOption {
    elo: number;
    label: string;
    description: string;
    color: string;
}

const ELO_OPTIONS: EloOption[] = [
    { elo: 400, label: 'Beginner', description: 'Just learning the rules', color: '#74b772' },
    { elo: 600, label: 'Novice', description: 'Knows basic tactics', color: '#8bc34a' },
    { elo: 800, label: 'Amateur', description: 'Starting to plan ahead', color: '#c6d440' },
    { elo: 1000, label: 'Club Player', description: 'Comfortable in most positions', color: '#f0d030' },
    { elo: 1200, label: 'Intermediate', description: 'Recognises common patterns', color: '#f0a830' },
    { elo: 1400, label: 'Adv. Amateur', description: 'Strong tactical awareness', color: '#f08030' },
    { elo: 1600, label: 'Expert', description: 'Solid positional understanding', color: '#e05030' },
    { elo: 1800, label: 'Candidate', description: 'Dangerous in the endgame', color: '#d03050' },
    { elo: 2000, label: 'National Master', description: 'Precise calculation', color: '#c030c0' },
    { elo: 2200, label: 'FIDE Master', description: 'Tournament-level threat', color: '#9040d0' },
    { elo: 2400, label: 'Int\'l Master', description: 'Near-flawless strategy', color: '#6060e0' },
    { elo: 2600, label: 'Grandmaster', description: 'Elite level competitor', color: '#4080e0' },
    { elo: 2800, label: 'Super GM', description: 'World championship caliber', color: '#03DAC6' },
];

interface Props {
    visible: boolean;
    currentElo: number;
    onSelectElo: (elo: number) => void;
    onClose: () => void;
}

export default function SettingsModal({ visible, currentElo, onSelectElo, onClose }: Props) {
    if (!visible) return null;

    return (
        <View style={styles.overlay}>
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft} />
                    <Text style={styles.headerTitle}>Settings</Text>
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <Text style={styles.closeButtonText}>✕</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView
                    style={styles.scroll}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    {/* Section Label */}
                    <Text style={styles.sectionLabel}>🤖  Bot Strength</Text>
                    <Text style={styles.sectionSub}>Choose the Elo rating of the computer opponent</Text>

                    {/* Current Selection Banner */}
                    <View style={[
                        styles.selectedBanner,
                        { borderColor: ELO_OPTIONS.find(o => o.elo === currentElo)?.color ?? '#3F8F88' },
                    ]}>
                        <View>
                            <Text style={styles.selectedBannerLabel}>
                                {ELO_OPTIONS.find(o => o.elo === currentElo)?.label ?? 'Custom'}
                            </Text>
                            <Text style={styles.selectedBannerElo}>Elo {currentElo}</Text>
                        </View>
                        <View style={[
                            styles.eloBadge,
                            { backgroundColor: ELO_OPTIONS.find(o => o.elo === currentElo)?.color ?? '#3F8F88' },
                        ]}>
                            <Text style={styles.eloBadgeText}>ACTIVE</Text>
                        </View>
                    </View>

                    {/* ELO Grid */}
                    <View style={styles.grid}>
                        {ELO_OPTIONS.map((option) => {
                            const isSelected = option.elo === currentElo;
                            return (
                                <TouchableOpacity
                                    key={option.elo}
                                    style={[
                                        styles.card,
                                        isSelected && { borderColor: option.color, borderWidth: 2 },
                                    ]}
                                    onPress={() => onSelectElo(option.elo)}
                                    activeOpacity={0.7}
                                >
                                    {/* Colored top stripe */}
                                    <View style={[styles.cardStripe, { backgroundColor: option.color }]} />
                                    <View style={styles.cardBody}>
                                        <Text style={styles.cardElo}>{option.elo}</Text>
                                        <Text style={styles.cardLabel}>{option.label}</Text>
                                        <Text style={styles.cardDesc} numberOfLines={2}>{option.description}</Text>
                                    </View>
                                    {isSelected && (
                                        <View style={[styles.checkBadge, { backgroundColor: option.color }]}>
                                            <Text style={styles.checkText}>✓</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#D9FDF8',
        zIndex: 2000,
    },
    safeArea: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#3F8F88',
    },
    headerLeft: {
        width: 36,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#3F8F88',
        letterSpacing: 1,
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#3F8F88',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButtonText: {
        color: '#D9FDF8',
        fontSize: 16,
        fontWeight: 'bold',
    },
    scroll: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 20,
    },
    sectionLabel: {
        fontSize: 18,
        fontWeight: '700',
        color: '#3F8F88',
        marginBottom: 4,
    },
    sectionSub: {
        fontSize: 13,
        color: '#1A433E',
        marginBottom: 18,
    },
    selectedBanner: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 2,
        padding: 16,
        marginBottom: 20,
    },
    selectedBannerLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#3F8F88',
    },
    selectedBannerElo: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    eloBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
    },
    eloBadgeText: {
        color: '#000',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    card: {
        width: '48%',
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#3F8F88',
        position: 'relative',
    },
    cardStripe: {
        height: 5,
        width: '100%',
    },
    cardBody: {
        padding: 12,
    },
    cardElo: {
        fontSize: 22,
        fontWeight: '800',
        color: '#3F8F88',
        marginBottom: 2,
    },
    cardLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#3F8F88',
        marginBottom: 4,
    },
    cardDesc: {
        fontSize: 11,
        color: '#666',
        lineHeight: 15,
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 22,
        height: 22,
        borderRadius: 11,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkText: {
        color: '#000',
        fontSize: 12,
        fontWeight: '900',
    },

});
