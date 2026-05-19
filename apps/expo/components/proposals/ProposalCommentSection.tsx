import { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import {
  fetchProposalComments,
  deleteProposalComment,
  type ProposalCommentRecord,
} from '@/lib/supabase-proposal-comments';
import ProposalCommentItem from './ProposalCommentItem';
import ProposalCommentComposer from './ProposalCommentComposer';

type Props = {
  proposalId: string;
  isCitizen: boolean;
};

export default function ProposalCommentSection({ proposalId, isCitizen }: Props) {
  const { colors } = useTheme();
  const { user } = useUser();

  const [comments, setComments] = useState<ProposalCommentRecord[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [composerVisible, setComposerVisible] = useState(false);

  const load = useCallback(
    async (pageNum: number, append: boolean = false) => {
      if (pageNum === 0) setLoading(true);
      else setLoadingMore(true);

      const result = await fetchProposalComments(proposalId, pageNum, user?.wallet_address);

      if (append) {
        setComments((prev) => [...prev, ...result.data]);
      } else {
        setComments(result.data);
      }
      setHasMore(result.hasMore);

      if (pageNum === 0) setLoading(false);
      else setLoadingMore(false);
    },
    [proposalId, user?.wallet_address],
  );

  useEffect(() => {
    setPage(0);
    load(0);
  }, [load]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    load(nextPage, true);
  };

  const handleCreated = () => {
    setPage(0);
    load(0);
  };

  const handleDelete = async (comment: ProposalCommentRecord) => {
    const walletAddress = user?.wallet_address;
    if (!walletAddress) return;
    if (comment.wallet_address?.toLowerCase() !== walletAddress.toLowerCase()) return;
    try {
      await deleteProposalComment(comment.id, walletAddress);
      setComments((prev) => prev.filter((c) => c.id !== comment.id));
    } catch {
      // logged in lib
    }
  };

  const canCompose = !!user && isCitizen;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Diskussion</Text>
          {comments.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.countText, { color: colors.primary }]}>{comments.length}</Text>
            </View>
          )}
        </View>
      </View>

      {canCompose ? (
        <Pressable
          onPress={() => setComposerVisible(true)}
          style={[styles.inputBar, { borderColor: colors.border }]}
        >
          {user!.profile_picture_url ? (
            <Image source={{ uri: user!.profile_picture_url }} style={styles.inputAvatar} />
          ) : (
            <View style={[styles.inputAvatarFallback, { backgroundColor: colors.primaryLight }]}>
              <Text style={[styles.inputAvatarText, { color: colors.primary }]}>
                {(user!.username || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.inputPlaceholder, { color: colors.textTertiary }]}>
            Was denkst du über diesen Vorschlag?
          </Text>
          <Ionicons name="chatbubble-outline" size={18} color={colors.textTertiary} />
        </Pressable>
      ) : (
        <View style={[styles.gateBar, { borderColor: colors.border }]}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.textTertiary} />
          <Text style={[styles.gateText, { color: colors.textSecondary }]}>
            Nur verifizierte Bürger können kommentieren
          </Text>
        </View>
      )}

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}

      {!loading && comments.length === 0 && (
        <View style={[styles.emptyState, { borderColor: colors.border }]}>
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            Noch keine Kommentare
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>
            Sei der/die Erste und teile deine Meinung!
          </Text>
        </View>
      )}

      {!loading && comments.length > 0 && (
        <View style={styles.list}>
          {comments.map((comment) => (
            <ProposalCommentItem
              key={comment.id}
              comment={comment}
              isOwner={user?.wallet_address === comment.wallet_address}
              walletAddress={user?.wallet_address}
              onDelete={handleDelete}
            />
          ))}
        </View>
      )}

      {hasMore && !loadingMore && (
        <Pressable onPress={handleLoadMore} style={styles.loadMoreButton}>
          <Text style={[styles.loadMoreText, { color: colors.primary }]}>Mehr laden</Text>
        </Pressable>
      )}
      {loadingMore && (
        <ActivityIndicator size="small" color={colors.primary} style={styles.loadingMore} />
      )}

      {canCompose && (
        <ProposalCommentComposer
          visible={composerVisible}
          onClose={() => setComposerVisible(false)}
          proposalId={proposalId}
          walletAddress={user!.wallet_address}
          onCommentCreated={handleCreated}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  inputAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  inputAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputAvatarText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  inputPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  gateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  gateText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  loadingContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyState: {
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
  },
  list: {
    gap: 12,
  },
  loadMoreButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loadMoreText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  loadingMore: {
    paddingVertical: 12,
  },
});
